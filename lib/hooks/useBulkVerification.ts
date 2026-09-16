"use client";

import { useCallback, useRef, useState } from "react";
import { parseFile } from "@/lib/parse";
import { checkSyntax, checkDisposable, checkRole, isBlockedProvider } from "@/lib/checks";
import { getMxHost } from "@/lib/dns";
import { verifyDomain } from "@/lib/domain";
import { classifyFinal } from "@/lib/classify";
import { mapWithConcurrency } from "@/lib/concurrency";
import { computeStats, initialStats } from "@/lib/stats";
import { labelDomainStatus } from "@/lib/domainStatusLabel";
import { addHistoryJob } from "@/lib/history";
import type { DomainResult, DomainStatus } from "@/lib/domain";
import type { EmailRecord, VerifyResult, Phase, Stats } from "@/lib/types";
import type { EnrichedResult } from "./types";

const BATCH_SIZE = 40;
const MX_CONCURRENCY = 10;

interface MxCandidate extends EmailRecord {
  syntax: boolean;
  disposable: boolean;
  role: boolean;
  domain: string;
  domainResult?: DomainResult | null;
}

interface SmtpCandidate extends MxCandidate {
  mx: boolean;
  mxHost: string | null;
}

function enrich(r: VerifyResult, domain: string, domainResult: DomainResult | null | undefined): EnrichedResult {
  return { ...r, domain, domainCategory: labelDomainStatus(domainResult).map((l) => l.category) };
}

async function getMxWithCache(
  cache: Map<string, string | null>,
  domain: string,
  domainMap?: Map<string, DomainResult>
): Promise<string | null> {
  if (cache.has(domain)) return cache.get(domain) ?? null;
  const cached = domainMap?.get(domain)?.mxHost ?? null;
  if (cached) {
    cache.set(domain, cached);
    return cached;
  }
  const h = await getMxHost(domain);
  cache.set(domain, h);
  return h;
}

export function useBulkVerification() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [stats, setStats] = useState<Stats>(initialStats());
  const [jobId, setJobId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const processBuffer = useCallback(async (buffer: ArrayBuffer, name: string) => {
    try {
      setStage("Parsing file...");
      const rawRecords = parseFile(buffer, name);

      if (rawRecords.length === 0) {
        setError("No emails found in the file.");
        setPhase("upload");
        return;
      }

      const seen = new Set<string>();
      const records = rawRecords.filter((r) => {
        if (seen.has(r.email)) return false;
        seen.add(r.email);
        return true;
      });

      cancelledRef.current = false;

      const all: MxCandidate[] = records.map((r) => ({
        ...r,
        syntax: checkSyntax(r.email),
        disposable: checkDisposable(r.email),
        role: checkRole(r.email),
        domain: r.email.split("@")[1] ?? "",
      }));

      // -------- Phase 1: Domain verification (ALL domains first) --------
      const uniqueDomains = Array.from(
        new Set(all.map((c) => c.domain).filter((d) => d.length > 0))
      );
      const domainMap = new Map<string, DomainResult>();

      if (uniqueDomains.length > 0 && !cancelledRef.current) {
        setStage(`Verifying ${uniqueDomains.length} unique domains...`);
        const domainResults = await mapWithConcurrency<string, DomainResult>(
          uniqueDomains,
          MX_CONCURRENCY,
          async (d) => {
            if (cancelledRef.current) throw new Error("CANCELLED");
            return verifyDomain(d);
          },
          (done, tot) => {
            const pct = Math.round((done / Math.max(tot, 1)) * 30);
            setProgress(pct);
            setStage(`Verifying domains: ${done}/${tot}...`);
          }
        );
        domainResults.forEach((r) => domainMap.set(r.domain, r));
      }

      for (const c of all) {
        c.domainResult = domainMap.get(c.domain) ?? null;
      }

      // -------- Phase 2: instant rejects (syntax + domain level) --------
      setStage("Running syntax & checks...");
      const mxTargets: MxCandidate[] = [];
      const quickInvalid: EnrichedResult[] = [];

      for (const c of all) {
        const ds = c.domainResult?.status ?? null;

        if (!c.syntax) {
          const f = classifyFinal({ syntax: false, disposable: c.disposable, role: c.role, domainStatus: ds, mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: false, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: ds, confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else if (ds === "FAKE") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "FAKE", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "FAKE", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else if (ds === "PARKED") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "PARKED", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "PARKED", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else if (ds === "NEW") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "NEW", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "NEW", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else if (c.domainResult?.hasNullMx) {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: ds, mx: false, smtp: "N/A", hasNullMx: true }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: false,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: ds, confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else if (isBlockedProvider(c.domain)) {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: ds, mx: true, smtp: "UNKNOWN", providerBlocked: true }, c.domain);
          quickInvalid.push(enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: true,
            smtp: "UNKNOWN", status: f.status, reason: f.reason,
            domainStatus: ds, confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          }, c.domain, c.domainResult));
        } else {
          mxTargets.push(c);
        }
      }

      // -------- Phase 3: MX check (all remaining) --------
      const mxCache = new Map<string, string | null>();
      const mxChecked = await mapWithConcurrency<MxCandidate, SmtpCandidate>(
        mxTargets,
        MX_CONCURRENCY,
        async (c) => {
          if (cancelledRef.current) throw new Error("CANCELLED");
          const mxHost = await getMxWithCache(mxCache, c.domain, domainMap);
          return { ...c, mx: mxHost !== null, mxHost };
        },
        (done, tot) => {
          const pct = 30 + Math.round((done / Math.max(tot, 1)) * 20);
          setProgress(pct);
          setStage(`Checking MX records... ${done}/${tot}`);
        }
      );

      // -------- Phase 4: SMTP check (all emails with MX) --------
      const noMx: EnrichedResult[] = mxChecked
        .filter((c) => !c.mx || !c.mxHost)
        .map((c) => {
          const { status, reason, confidence, verdict, tag } = classifyFinal(
            { syntax: true, disposable: c.disposable, role: c.role, domainStatus: c.domainResult?.status ?? null, mx: false, smtp: "N/A", hasNullMx: c.domainResult?.hasNullMx },
            c.domain
          );
          return enrich({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: false,
            smtp: "N/A", status, reason,
            domainStatus: c.domainResult?.status ?? null,
            confidence, verdict, tag,
          }, c.domain, c.domainResult);
        });

      const smtpCandidates = mxChecked.filter((c) => c.mx && c.mxHost);
      const totalBatches = Math.ceil(smtpCandidates.length / BATCH_SIZE);
      const smtpResults: EnrichedResult[] = [];

      const buildResult = (r: VerifyResult, c: SmtpCandidate): EnrichedResult => {
        const { status, reason, confidence, verdict, tag } = classifyFinal(
          {
            syntax: true,
            disposable: c.disposable,
            role: c.role,
            domainStatus: c.domainResult?.status ?? null,
            mx: c.mx,
            smtp: r.smtp,
            hasNullMx: c.domainResult?.hasNullMx,
          },
          c.domain
        );
        return enrich({
          ...r,
          syntax: true,
          disposable: c.disposable,
          role: c.role,
          mx: c.mx,
          status,
          reason,
          domainStatus: r.domainStatus ?? c.domainResult?.status ?? null,
          confidence,
          verdict,
          tag,
        }, c.domain, c.domainResult);
      };

      const batchIndices = Array.from({ length: totalBatches }, (_, i) => i);
      await mapWithConcurrency<number, void>(
        batchIndices,
        2,
        async (i) => {
          if (cancelledRef.current) throw new Error("CANCELLED");
          const slice = smtpCandidates.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
          const res = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              batchIndex: i,
              emails: slice.map((c) => ({
                id: c.id,
                email: c.email,
                mxHost: c.mxHost,
                originalRow: c.originalRow,
              })),
            }),
          });
          if (!res.ok) throw new Error("Verification server error, please retry.");
          const data = await res.json();
          const withDomain = (data.results as VerifyResult[]).map((r) => {
            const c = slice.find((s) => s.id === r.id);
            if (!c) return enrich(r, r.email.split("@")[1] ?? "", null);
            return buildResult(r, c);
          });
          smtpResults.push(...withDomain);
          const partial = [...quickInvalid, ...noMx, ...smtpResults];
          setResults(partial);
          setStats(computeStats(partial));
        },
        (done, tot) => {
          setProgress(50 + Math.round((done / Math.max(tot, 1)) * 50));
          setStage(`Verifying mailboxes via SMTP... ${done}/${tot}`);
        }
      );

      const finalResults = [...quickInvalid, ...noMx, ...smtpResults];
      setResults(finalResults);
      const finalStats = computeStats(finalResults);
      setStats(finalStats);
      setProgress(100);
      setStage("Done");
      setPhase("results");

      try {
        const job = addHistoryJob({ type: "bulk", label: name, stats: finalStats, rows: finalResults });
        setJobId(job.id);
      } catch {
        // history is a UI convenience only — never let it break verification
      }
    } catch (e: any) {
      if (e?.message === "CANCELLED") {
        setError("Processing cancelled.");
      } else {
        setError(e?.message || "Processing failed.");
      }
      setPhase("upload");
    }
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setError("");
      setFileName(file.name);
      setPhase("processing");
      setProgress(0);

      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const isSpreadsheet = /\.(xlsx|xls)$/i.test(file.name);
      const isText = file.name.toLowerCase().endsWith(".txt");

      if (!isCsv && !isSpreadsheet && !isText) {
        setError("Please upload a .csv, .xlsx, .xls or .txt file.");
        setPhase("upload");
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        await processBuffer(buffer, file.name);
      } catch (e: any) {
        setError(e?.message || "Could not read file.");
        setPhase("upload");
      }
    },
    [processBuffer]
  );

  const cancelProcessing = useCallback(() => {
    cancelledRef.current = true;
    setError("Cancelling after current batch...");
  }, []);

  const reset = useCallback(() => {
    setPhase("upload");
    setResults([]);
    setStats(initialStats());
    setProgress(0);
    setError("");
    setFileName("");
    setJobId(null);
  }, []);

  return { phase, fileName, error, progress, stage, results, stats, jobId, handleFile, cancelProcessing, reset };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseFile, toCSV, toXLSX, downloadBlob } from "@/lib/parse";
import { checkSyntax, checkDisposable, checkRole, isBlockedProvider } from "@/lib/checks";
import { getMxHost } from "@/lib/dns";
import { verifyDomain } from "@/lib/domain";
import { classifyFinal } from "@/lib/classify";
import type { DomainResult, DomainStatus } from "@/lib/domain";
import type {
  EmailRecord,
  VerifyResult,
  VerifyStatus,
  VerdictType,
  Phase,
  Stats,
} from "@/lib/types";

const BATCH_SIZE = 40;
const MX_CONCURRENCY = 10;
const FX_CONCURRENCY = 8;

interface MxCandidate extends EmailRecord {
  syntax: boolean;
  disposable: boolean;
  role: boolean;
  domain: string;
  skipMx?: boolean;
  domainResult?: DomainResult | null;
}

interface SmtpCandidate extends MxCandidate {
  mx: boolean;
  mxHost: string | null;
}

function initialStats(): Stats {
  return { total: 0, valid: 0, invalid: 0, unknown: 0, pending: 0, verified: 0, notVerified: 0, uncertain: 0 };
}

function computeStats(results: VerifyResult[]): Stats {
  const s = initialStats();
  s.total = results.length;
  for (const r of results) {
    if (r.status === "VALID") s.valid++;
    else if (r.status === "INVALID") s.invalid++;
    else if (r.status === "UNKNOWN") s.unknown++;
    else s.pending++;
    if (r.verdict === "Verified") s.verified++;
    else if (r.verdict === "Not Verified") s.notVerified++;
    else s.uncertain++;
  }
  return s;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress: (done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let doneCount = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
      doneCount++;
      onProgress(doneCount, items.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker
  );
  await Promise.all(workers);
  return results;
}

async function getMxWithCache(
  cache: Map<string, string | null>,
  domain: string
): Promise<string | null> {
  if (cache.has(domain)) return cache.get(domain) ?? null;
  const h = await getMxHost(domain);
  cache.set(domain, h);
  return h;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [results, setResults] = useState<VerifyResult[]>([]);
  const [stats, setStats] = useState<Stats>(initialStats());
  const [filter, setFilter] = useState<"all" | VerdictType | VerifyStatus>("all");
  const [search, setSearch] = useState("");
  const [showAllChecks, setShowAllChecks] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [globalDrag, setGlobalDrag] = useState(false);
  const cancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phaseRef = useRef<Phase>("upload");
  phaseRef.current = phase;

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      setError("");
      setFileName(file.name);
      setPhase("processing");
      setProgress(0);

      const validTypes = [".csv", ".xlsx", ".xls", ".txt"];
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
        processBuffer(buffer, file.name);
      } catch (e: any) {
        setError(e?.message || "Could not read file.");
        setPhase("upload");
      }
    },
    []
  );

  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setGlobalDrag(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (
        e.clientX <= 0 || e.clientY <= 0 ||
        e.clientX >= window.innerWidth - 1 || e.clientY >= window.innerHeight - 1
      ) {
        setGlobalDrag(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setGlobalDrag(false);
      if (phaseRef.current === "upload") {
        handleFileRef.current(e.dataTransfer?.files?.[0]);
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  async function processBuffer(buffer: ArrayBuffer, name: string) {
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

      const total = records.length;
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
        await mapWithConcurrency<string, DomainResult>(
          uniqueDomains,
          MX_CONCURRENCY,
          async (d) => {
            if (cancelledRef.current) throw new Error("CANCELLED");
            return verifyDomain(d);
          },
          async (done, tot) => {
            const pct = Math.round((done / Math.max(tot, 1)) * 30);
            setProgress(pct);
            setStage(`Verifying domains: ${done}/${tot}...`);
          }
        ).then((results) => {
          results.forEach((r) => domainMap.set(r.domain, r));
        });
      }

      for (const c of all) {
        c.domainResult = domainMap.get(c.domain) ?? null;
      }

      // -------- Phase 2: instant rejects (syntax + domain level) --------
      setStage("Running syntax & checks...");
      const mxTargets: MxCandidate[] = [];
      const quickInvalid: VerifyResult[] = [];

      for (const c of all) {
        const ds = c.domainResult?.status ?? null;

        if (!c.syntax) {
          const f = classifyFinal({ syntax: false, disposable: c.disposable, role: c.role, domainStatus: ds, mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: false, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: ds, confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          });
        } else if (ds === "FAKE") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "FAKE", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "FAKE", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          });
        } else if (ds === "PARKED") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "PARKED", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "PARKED", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          });
        } else if (ds === "NEW") {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: "NEW", mx: false, smtp: "N/A" }, c.domain);
          quickInvalid.push({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: null,
            smtp: "N/A", status: f.status, reason: f.reason,
            domainStatus: "NEW", confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          });
        } else if (isBlockedProvider(c.domain)) {
          const f = classifyFinal({ syntax: true, disposable: c.disposable, role: c.role, domainStatus: ds, mx: true, smtp: "UNKNOWN", providerBlocked: true }, c.domain);
          quickInvalid.push({
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: true,
            smtp: "UNKNOWN", status: f.status, reason: f.reason,
            domainStatus: ds, confidence: f.confidence, verdict: f.verdict, tag: f.tag,
          });
        } else {
          mxTargets.push(c);
        }
      }

      // -------- Phase 3: MX check (all remaining, incl. role/disposable) --------
      let mxPhaseDone = 0;
      const mxCache = new Map<string, string | null>();
      const mxChecked = await mapWithConcurrency<MxCandidate, SmtpCandidate>(
        mxTargets,
        MX_CONCURRENCY,
        async (c) => {
          if (cancelledRef.current) throw new Error("CANCELLED");
          const mxHost = await getMxWithCache(mxCache, c.domain);
          return { ...c, mx: mxHost !== null, mxHost };
        },
        async (done, tot) => {
          mxPhaseDone = done;
          const pct = 30 + Math.round((done / Math.max(tot, 1)) * 20);
          setProgress(pct);
          setStage(`Checking MX records... ${done}/${tot}`);
        }
      );

      // -------- Phase 4: SMTP check (all emails with MX) --------
      const noMx: VerifyResult[] = mxChecked
        .filter((c) => !c.mx || !c.mxHost)
        .map((c) => {
          const { status, reason, confidence, verdict, tag } = classifyFinal(
            { syntax: true, disposable: c.disposable, role: c.role, domainStatus: c.domainResult?.status ?? null, mx: false, smtp: "N/A" },
            c.domain
          );
          const base: VerifyResult = {
            id: c.id, email: c.email, originalRow: c.originalRow,
            syntax: true, disposable: c.disposable, role: c.role, mx: false,
            smtp: "N/A", status, reason,
            domainStatus: c.domainResult?.status ?? null,
            confidence, verdict, tag,
          };
          return base;
        });

      const smtpCandidates = mxChecked.filter((c) => c.mx && c.mxHost);
      const smtpDomainStatus = new Map<string, DomainStatus | null>();
      smtpCandidates.forEach((c) => {
        smtpDomainStatus.set(c.email, c.domainResult?.status ?? "REAL");
      });
      const totalBatches = Math.ceil(smtpCandidates.length / BATCH_SIZE);

      const smtpResults: VerifyResult[] = [];

      const buildResult = (r: VerifyResult, c: SmtpCandidate): VerifyResult => {
        const { status, reason, confidence, verdict, tag } = classifyFinal(
          {
            syntax: true,
            disposable: c.disposable,
            role: c.role,
            domainStatus: c.domainResult?.status ?? null,
            mx: c.mx,
            smtp: r.smtp,
          },
          c.domain
        );
        return {
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
        };
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
            if (!c) return {
              ...r,
              domainStatus: smtpDomainStatus.get(r.email) ?? null,
            };
            return buildResult(r, c);
          });
          smtpResults.push(...withDomain);
          const partial = [...quickInvalid, ...noMx, ...smtpResults];
          setResults(partial);
          setStats(computeStats(partial));
        },
        async (done, tot) => {
          setProgress(50 + Math.round((done / Math.max(tot, 1)) * 50));
          setStage(`Verifying mailboxes via SMTP... ${done}/${tot}`);
        }
      );

      const finalResults = [...quickInvalid, ...noMx, ...smtpResults];
      setResults(finalResults);
      setStats(computeStats(finalResults));
      setProgress(100);
      setStage("Done");
      setPhase("results");
    } catch (e: any) {
      if (e?.message === "CANCELLED") {
        setError("Processing cancelled.");
      } else {
        setError(e?.message || "Processing failed.");
      }
      setPhase("upload");
    }
  }

  function cancelProcessing() {
    cancelledRef.current = true;
    setError("Cancelling after current batch...");
  }

  // -------- Download helpers --------
  const filteredResults = results.filter((r) => {
    if (filter === "Verified" && r.verdict !== "Verified") return false;
    if (filter === "Not Verified" && r.verdict !== "Not Verified") return false;
    if (filter === "Uncertain" && r.verdict !== "Uncertain") return false;
    if (filter === "VALID" && r.status !== "VALID") return false;
    if (filter === "INVALID" && r.status !== "INVALID") return false;
    if (filter === "UNKNOWN" && r.status !== "UNKNOWN") return false;
    if (search && !r.email.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  function resultToRow(r: VerifyResult): Record<string, string> {
    const fmtPass = (v: boolean | null) =>
      v === null ? "-" : v ? "Pass" : "Fail";
    const fmtYes = (v: boolean | null) =>
      v === null ? "-" : v ? "Yes" : "No";
    return {
      ...r.originalRow,
      Email: r.email,
      Domain: domainLabel(r.domainStatus ?? null),
      Mailbox: smtpLabel(r.smtp),
      "Confidence (%)": String(r.confidence),
      "Verified?": r.verdict,
      Tag: r.tag ?? "",
      Syntax: fmtPass(r.syntax),
      Disposable: fmtYes(r.disposable),
      "Role-Based": fmtYes(r.role),
      MX: fmtPass(r.mx),
      SMTP: r.smtp,
      Status: r.status,
      Reason: r.reason,
    };
  }

  function downloadValid(type: "csv" | "xlsx") {
    const rows = results.filter((r) => r.verdict === "Verified").map(resultToRow);
    if (rows.length === 0) return;
    if (type === "csv") downloadBlob(toCSV(rows), "verified_emails.csv", "text/csv");
    else downloadBlob(toXLSX(rows, "Verified"), "verified_emails.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function downloadInvalid(type: "csv" | "xlsx") {
    const rows = results.filter((r) => r.verdict === "Not Verified").map(resultToRow);
    if (rows.length === 0) return;
    if (type === "csv") downloadBlob(toCSV(rows), "not_verified_emails.csv", "text/csv");
    else downloadBlob(toXLSX(rows, "Not Verified"), "not_verified_emails.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function downloadFull(type: "csv" | "xlsx") {
    const rows = results.map(resultToRow);
    if (rows.length === 0) return;
    if (type === "csv") downloadBlob(toCSV(rows), "full_report.csv", "text/csv");
    else downloadBlob(toXLSX(rows, "Full Report"), "full_report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  // -------- Status badge colors --------
  function statusClass(s: VerifyStatus): string {
    if (s === "VALID")
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    if (s === "INVALID")
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    if (s === "UNKNOWN")
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    if (s === "N/A") return "bg-slate-500/15 text-slate-400 border-slate-500/30";
    return "bg-slate-500/15 text-slate-400 border-slate-500/30";
  }

  function domainText(s: DomainStatus | null): string {
    if (s === "REAL") return "Active";
    if (s === "PARKED") return "Parked";
    if (s === "NEW") return "New";
    if (s === "FAKE") return "Not Found";
    return "Uncertain";
  }

  function domainStatusBadge(s: DomainStatus | null) {
    if (s === null)
      return "bg-slate-500/10 text-slate-500 border-slate-500/25";
    if (s === "REAL")
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    if (s === "PARKED")
      return "bg-sky-500/10 text-sky-400 border-sky-500/25";
    if (s === "NEW")
      return "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25";
    if (s === "FAKE")
      return "bg-rose-500/10 text-rose-400 border-rose-500/25";
    return "bg-slate-500/10 text-slate-400 border-slate-500/25";
  }

  function verdictConfBadge(v: VerdictType, score: number) {
    const conf =
      score >= 80
        ? "text-emerald-300"
        : score >= 40
        ? "text-amber-300"
        : "text-rose-300";
    const cls =
      v === "Verified"
        ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
        : v === "Not Verified"
        ? "bg-rose-500/15 text-rose-400 ring-rose-500/30"
        : "bg-amber-500/15 text-amber-400 ring-amber-500/30";
    return (
      <span
        className={
          "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold ring-1 " +
          cls
        }
      >
        <span>
          {v === "Verified" ? "✔" : v === "Not Verified" ? "✘" : "?"} {v}
        </span>
        <span className={"font-mono " + conf}>{score}%</span>
      </span>
    );
  }

  function verdictBadge(v: VerdictType) {
    if (v === "Verified")
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-500/30">
          ✔ VERIFIED
        </span>
      );
    if (v === "Not Verified")
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/30">
          ✘ NOT VERIFIED
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/30">
        ? UNCERTAIN
      </span>
    );
  }

  function smtpLabel(s: VerifyStatus): string {
    if (s === "VALID") return "Exists";
    if (s === "INVALID") return "Not found";
    if (s === "CATCHALL") return "Catch-all";
    if (s === "UNKNOWN") return "?";
    return "-";
  }

  function domainLabel(s: DomainStatus | null): string {
    if (s === "REAL") return "Active";
    if (s === "PARKED") return "Parked";
    if (s === "NEW") return "New";
    if (s === "FAKE") return "Not Found";
    return "Uncertain";
  }

  function checkBadge(pass: boolean | null) {
    if (pass === null) {
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-slate-500/10 text-slate-500 border-slate-500/25">
          -
        </span>
      );
    }
    return (
      <span
        className={
          "inline-block px-2 py-0.5 text-[11px] font-semibold rounded border " +
          (pass
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
            : "bg-rose-500/10 text-rose-400 border-rose-500/25")
        }
      >
        {pass ? "PASS" : "FAIL"}
      </span>
    );
  }

  function smtpBadge(s: VerifyStatus) {
    if (s === "VALID")
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
          EXISTS
        </span>
      );
    if (s === "INVALID")
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-rose-500/10 text-rose-400 border-rose-500/25">
          NOT FOUND
        </span>
      );
    if (s === "UNKNOWN")
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-amber-500/10 text-amber-400 border-amber-500/25">
          INCONCLUSIVE
        </span>
      );
    if (s === "CATCHALL")
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-purple-500/10 text-purple-400 border-purple-500/25">
          CATCH-ALL
        </span>
      );
    if (s === "N/A")
      return (
        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-slate-500/10 text-slate-500 border-slate-500/25">
          -
        </span>
      );
    return (
      <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded border bg-slate-500/10 text-slate-400 border-slate-500/25">
        -
      </span>
    );
  }

  // ==================== RENDER ====================
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Free Email Verifier
        </h1>
        <p className="mt-2 text-slate-400">
          Upload CSV / XLSX - verify syntax, disposable, MX &amp; SMTP mailbox -
          download results.
        </p>
      </div>

      {globalDrag && phase === "upload" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-indigo-400 bg-slate-900/80 px-12 py-14 text-center">
            <p className="text-2xl font-bold text-indigo-300">
              Drop your file here
            </p>
            <p className="mt-2 text-sm text-slate-400">
              .CSV .XLSX .XLS .TXT - verification shuru ho jayegi
            </p>
          </div>
        </div>
      )}

      {/* ---------- UPLOAD ---------- */}
      {phase === "upload" && (
        <div className="mx-auto max-w-2xl">
          <div
            className={
              "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-8 py-16 text-center transition-colors " +
              (dragOver
                ? "border-indigo-400 bg-indigo-500/10"
                : "border-slate-700 bg-slate-900/60 hover:border-slate-500")
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <svg
              className="mb-4 h-14 w-14 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-lg font-semibold">
              Drag &amp; drop your file here
            </p>
            <p className="mt-1 text-sm text-slate-400">
              or click to browse - .CSV, .XLSX, .XLS, .TXT
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-6 rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500"
            >
              Choose File
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            {[
              ["Syntax", "Format validation"],
              ["MX Records", "Domain mail server check"],
              ["SMTP", "Real mailbox existence"],
            ].map(([t, d]) => (
              <div
                key={t}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <p className="font-semibold text-indigo-300">{t}</p>
                <p className="mt-1 text-xs text-slate-400">{d}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center text-xs text-amber-200/80">
            The file must have a column named <strong>Email</strong>. Results are
            processed entirely in your browser + a free serverless SMTP check.
            Files are never stored anywhere.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>
      )}

      {/* ---------- PROCESSING ---------- */}
      {phase === "processing" && (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
            <h2 className="text-lg font-semibold">Verifying {fileName}</h2>
            <p className="mt-1 text-sm text-slate-400">{stage}</p>

            <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-right text-sm font-semibold text-indigo-300">
              {progress}%
            </p>

            {stats.total > 0 && (
              <div className="mt-6 flex gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Verified: <b>{stats.verified}</b>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  Not Verified: <b>{stats.notVerified}</b>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Uncertain: <b>{stats.uncertain}</b>
                </span>
              </div>
            )}

            <button
              onClick={cancelProcessing}
              className="mt-6 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-500 hover:text-rose-300"
            >
              Cancel
            </button>
          </div>

          {results.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Domain</th>
                    <th className="px-3 py-2">Verified?</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {results.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {r.email}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            "rounded border px-2 py-0.5 text-[11px] font-semibold " +
                            domainStatusBadge(r.domainStatus ?? null)
                          }
                        >
                          {domainText(r.domainStatus ?? null)}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{verdictBadge(r.verdict)}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={
                            "rounded border px-2 py-0.5 text-[11px] font-semibold " +
                            statusClass(r.status)
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>
      )}

      {/* ---------- RESULTS ---------- */}
      {phase === "results" && (
        <div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">
                {stats.verified}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Verified
              </p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
              <p className="text-3xl font-bold text-rose-400">
                {stats.notVerified}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Not Verified
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
              <p className="text-3xl font-bold text-amber-400">
                {stats.uncertain}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Uncertain
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-center">
              <p className="text-3xl font-bold text-slate-300">{stats.total}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Total
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-400">
              Download:
            </span>
            {[
              {
                label: "Verified CSV",
                onClick: () => downloadValid("csv"),
              },
              {
                label: "Verified XLSX",
                onClick: () => downloadValid("xlsx"),
              },
              {
                label: "Not Verified CSV",
                onClick: () => downloadInvalid("csv"),
              },
              {
                label: "Not Verified XLSX",
                onClick: () => downloadInvalid("xlsx"),
              },
              {
                label: "Full Report CSV",
                onClick: () => downloadFull("csv"),
              },
              {
                label: "Full Report XLSX",
                onClick: () => downloadFull("xlsx"),
              },
            ].map((b) => (
              <button
                key={b.label}
                onClick={b.onClick}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                {b.label}
              </button>
            ))}
            <button
              onClick={() => {
                setPhase("upload");
                setResults([]);
                setStats(initialStats());
                setProgress(0);
                setError("");
              }}
              className="ml-auto rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500"
            >
              New File
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              {(["all", "Verified", "Not Verified", "Uncertain"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                    (filter === f
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200")
                  }
                >
                  {f === "all" ? "All" : f}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showAllChecks}
              onChange={(e) => setShowAllChecks(e.target.checked)}
              className="h-4 w-4 accent-indigo-500"
            />
            Show more details (Mailbox, Status, checks, reason)
          </label>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table
              className={
                "w-full text-left text-sm " +
                (showAllChecks ? "min-w-[1100px]" : "min-w-[500px]")
              }
            >
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Verified?</th>
                  {showAllChecks && (
                    <>
                      <th className="px-4 py-3">Mailbox</th>
                      <th className="px-4 py-3">Tag</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Syntax</th>
                      <th className="px-4 py-3">Disposable</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">MX</th>
                      <th className="px-4 py-3">Reason</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                {filteredResults.length === 0 && (
                  <tr>
                    <td
                      colSpan={showAllChecks ? 11 : 3}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No results match the current filter.
                    </td>
                  </tr>
                )}
                {filteredResults.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                      {r.email}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          "rounded border px-2 py-0.5 text-[11px] font-semibold " +
                          domainStatusBadge(r.domainStatus ?? null)
                        }
                      >
                        {domainText(r.domainStatus ?? null)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {verdictConfBadge(r.verdict, r.confidence)}
                    </td>
                    {showAllChecks && (
                      <>
                        <td className="px-4 py-2.5">{smtpBadge(r.smtp)}</td>
                        <td className="px-4 py-2.5">
                          {r.tag ? (
                            <span className="rounded border border-slate-500/40 bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                              {r.tag}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              "rounded border px-2 py-0.5 text-[11px] font-bold " +
                              statusClass(r.status)
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {checkBadge(r.syntax)}
                        </td>
                        <td className="px-4 py-2.5">
                          {checkBadge(!r.disposable)}
                        </td>
                        <td className="px-4 py-2.5">
                          {checkBadge(!r.role)}
                        </td>
                        <td className="px-4 py-2.5">
                          {checkBadge(r.mx)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400">
                          {r.reason}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-800/60 pt-6 text-center text-xs text-slate-500">
        100% free - built with Next.js · no paid APIs · no data storage ·
        undeployable to Vercel free tier
      </footer>
    </main>
  );
}
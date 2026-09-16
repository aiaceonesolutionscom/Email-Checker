"use client";

import { useCallback, useState } from "react";
import { checkSyntax, checkDisposable, checkRole, isBlockedProvider } from "@/lib/checks";
import { getMxHost } from "@/lib/dns";
import { verifyDomain } from "@/lib/domain";
import { classifyFinal } from "@/lib/classify";
import { computeStats } from "@/lib/stats";
import { labelDomainStatus } from "@/lib/domainStatusLabel";
import { addHistoryJob } from "@/lib/history";
import type { DomainResult } from "@/lib/domain";
import type { VerifyResult } from "@/lib/types";
import type { EnrichedResult } from "./types";

export type SingleCheckState = "idle" | "checking" | "done" | "error";

function enrich(r: VerifyResult, domain: string, domainResult: DomainResult | null | undefined): EnrichedResult {
  return { ...r, domain, domainCategory: labelDomainStatus(domainResult).map((l) => l.category) };
}

export function useSingleVerification() {
  const [state, setState] = useState<SingleCheckState>("idle");
  const [result, setResult] = useState<EnrichedResult | null>(null);
  const [error, setError] = useState("");

  const check = useCallback(async (rawEmail: string) => {
    const email = rawEmail.trim().toLowerCase();
    setState("checking");
    setError("");
    setResult(null);

    try {
      const domain = email.split("@")[1] ?? "";
      const syntax = checkSyntax(email);
      const disposable = checkDisposable(email);
      const role = checkRole(email);
      const originalRow = { Email: email };
      const id = 1;

      if (!syntax) {
        const f = classifyFinal({ syntax: false, disposable, role, domainStatus: null, mx: false, smtp: "N/A" }, domain);
        const final = enrich({
          id, email, originalRow, syntax: false, disposable, role, mx: null,
          smtp: "N/A", status: f.status, reason: f.reason, domainStatus: null,
          confidence: f.confidence, verdict: f.verdict, tag: f.tag,
        }, domain, null);
        setResult(final);
        setState("done");
        addHistoryJob({ type: "single", label: email, stats: computeStats([final]), rows: [final] });
        return;
      }

      const domainResult = domain ? await verifyDomain(domain) : null;
      const ds = domainResult?.status ?? null;

      const finalizeQuick = (status: typeof ds, mx: boolean | null, smtp: "N/A" | "UNKNOWN", extra?: { hasNullMx?: boolean; providerBlocked?: boolean }) => {
        const f = classifyFinal({ syntax: true, disposable, role, domainStatus: status, mx: mx ?? false, smtp, ...extra }, domain);
        const final = enrich({
          id, email, originalRow, syntax: true, disposable, role, mx,
          smtp, status: f.status, reason: f.reason, domainStatus: status,
          confidence: f.confidence, verdict: f.verdict, tag: f.tag,
        }, domain, domainResult);
        setResult(final);
        setState("done");
        addHistoryJob({ type: "single", label: email, stats: computeStats([final]), rows: [final] });
      };

      if (ds === "FAKE") return finalizeQuick("FAKE", false, "N/A");
      if (ds === "PARKED") return finalizeQuick("PARKED", false, "N/A");
      if (ds === "NEW") return finalizeQuick("NEW", false, "N/A");
      if (domainResult?.hasNullMx) return finalizeQuick(ds, false, "N/A", { hasNullMx: true });
      if (isBlockedProvider(domain)) return finalizeQuick(ds, true, "UNKNOWN", { providerBlocked: true });

      const mxHost = await getMxHost(domain);
      if (!mxHost) return finalizeQuick(ds, false, "N/A");

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchIndex: 0,
          emails: [{ id, email, mxHost, originalRow }],
        }),
      });
      if (!res.ok) throw new Error("Verification server error, please retry.");
      const data = await res.json();
      const raw = (data.results as VerifyResult[])[0];
      if (!raw) throw new Error("No result returned from verification server.");

      const f = classifyFinal(
        { syntax: true, disposable, role, domainStatus: ds, mx: true, smtp: raw.smtp, hasNullMx: domainResult?.hasNullMx },
        domain
      );
      const final = enrich({
        ...raw,
        syntax: true, disposable, role, mx: true,
        status: f.status, reason: f.reason, domainStatus: ds,
        confidence: f.confidence, verdict: f.verdict, tag: f.tag,
      }, domain, domainResult);
      setResult(final);
      setState("done");
      addHistoryJob({ type: "single", label: email, stats: computeStats([final]), rows: [final] });
    } catch (e: any) {
      setError(e?.message || "Verification failed.");
      setState("error");
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setError("");
  }, []);

  return { state, result, error, check, reset };
}

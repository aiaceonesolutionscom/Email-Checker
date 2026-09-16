import type { VerifyStatus, VerdictType } from "./types";
import type { DomainStatus } from "./domain";

export interface ClassifyInput {
  syntax: boolean;
  disposable: boolean;
  role: boolean;
  domainStatus: DomainStatus | null;
  mx: boolean;
  smtp: VerifyStatus;
  providerBlocked?: boolean;
  hasNullMx?: boolean;
}

export interface ClassifyOutput {
  status: VerifyStatus;
  reason: string;
  confidence: number;
  verdict: VerdictType;
  tag: string;
}

export function classifyFinal(
  input: ClassifyInput,
  domain?: string
): ClassifyOutput {
  const ds = input.domainStatus;

  const tag = input.role ? "Role/Shared" : "";

  if (!input.syntax) {
    return { status: "INVALID", reason: "Invalid email syntax", confidence: 0, verdict: "Not Verified", tag };
  }
  if (ds === "FAKE") {
    return { status: "INVALID", reason: `Domain not registered (${domain ?? "unknown"})`, confidence: 2, verdict: "Not Verified", tag };
  }
  if (ds === "PARKED") {
    return { status: "INVALID", reason: `Domain registered but parked (${domain ?? "unknown"})`, confidence: 3, verdict: "Not Verified", tag };
  }
  if (ds === "NEW") {
    return { status: "UNKNOWN", reason: `Recently registered domain (${domain ?? "unknown"})`, confidence: 30, verdict: "Uncertain", tag };
  }
  if (input.disposable) {
    return { status: "INVALID", reason: "Disposable email address", confidence: 3, verdict: "Not Verified", tag };
  }
  if (!input.mx) {
    if (input.hasNullMx) {
      return {
        status: "INVALID",
        reason: "Domain explicitly rejects email (null MX record)",
        confidence: 2,
        verdict: "Not Verified",
        tag,
      };
    }
    if (input.domainStatus === "REAL") {
      return {
        status: "UNKNOWN",
        reason: "MX record response inconsistent - domain was verified active",
        confidence: 40,
        verdict: "Uncertain",
        tag,
      };
    }
    return {
      status: "INVALID",
      reason: "No MX record found for domain",
      confidence: 5,
      verdict: "Not Verified",
      tag,
    };
  }
  if (input.providerBlocked) {
    return { status: "UNKNOWN", reason: "Provider blocks SMTP verification - mailbox cannot be confirmed", confidence: 45, verdict: "Uncertain", tag };
  }

  if (input.smtp === "VALID") {
    return { status: "VALID", reason: "All checks passed", confidence: input.role ? 85 : 92, verdict: "Verified", tag };
  }
  if (input.smtp === "INVALID") {
    return { status: "INVALID", reason: "Mailbox does not exist (SMTP)", confidence: 8, verdict: "Not Verified", tag };
  }
  if (input.smtp === "CATCHALL") {
    return { status: "UNKNOWN", reason: "Catch-all server - mailbox cannot be confirmed", confidence: 25, verdict: "Uncertain", tag };
  }

  return { status: "UNKNOWN", reason: "SMTP check inconclusive", confidence: 45, verdict: "Uncertain", tag };
}

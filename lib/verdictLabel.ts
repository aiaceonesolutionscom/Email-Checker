import type { VerdictType, VerifyStatus } from "./types";
import type { Tone } from "./domainStatusLabel";

export function verdictLabel(v: VerdictType): string {
  if (v === "Verified") return "VERIFIED";
  if (v === "Not Verified") return "NOT VERIFIED";
  return "UNKNOWN";
}

export function verdictTone(v: VerdictType): Tone {
  if (v === "Verified") return "positive";
  if (v === "Not Verified") return "negative";
  return "warning";
}

export function smtpLabel(s: VerifyStatus): string {
  if (s === "VALID") return "Exists";
  if (s === "INVALID") return "Not found";
  if (s === "CATCHALL") return "Catch-all";
  if (s === "UNKNOWN") return "Inconclusive";
  return "-";
}

export function smtpTone(s: VerifyStatus): Tone {
  if (s === "VALID") return "positive";
  if (s === "INVALID") return "negative";
  if (s === "UNKNOWN") return "warning";
  if (s === "CATCHALL") return "warning";
  return "neutral";
}

export function statusTone(s: VerifyStatus): Tone {
  if (s === "VALID") return "positive";
  if (s === "INVALID") return "negative";
  if (s === "UNKNOWN") return "warning";
  return "neutral";
}

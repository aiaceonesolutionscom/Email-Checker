import type { Stats, VerifyResult } from "./types";

export function initialStats(): Stats {
  return {
    total: 0,
    valid: 0,
    invalid: 0,
    unknown: 0,
    pending: 0,
    verified: 0,
    notVerified: 0,
    uncertain: 0,
  };
}

export function computeStats(results: VerifyResult[]): Stats {
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

export function mergeStats(a: Stats, b: Stats): Stats {
  return {
    total: a.total + b.total,
    valid: a.valid + b.valid,
    invalid: a.invalid + b.invalid,
    unknown: a.unknown + b.unknown,
    pending: a.pending + b.pending,
    verified: a.verified + b.verified,
    notVerified: a.notVerified + b.notVerified,
    uncertain: a.uncertain + b.uncertain,
  };
}

export interface EmailRecord {
  id: number;
  email: string;
  originalRow: Record<string, string>;
}

import type { DomainStatus } from "./domain";

export type VerifyStatus = "VALID" | "INVALID" | "UNKNOWN" | "PENDING" | "N/A" | "CATCHALL";

export type VerdictType = "Verified" | "Not Verified" | "Uncertain";

export interface VerifyResult {
  id: number;
  email: string;
  originalRow: Record<string, string>;
  syntax: boolean | null;
  disposable: boolean | null;
  role: boolean | null;
  mx: boolean | null;
  smtp: VerifyStatus;
  status: VerifyStatus;
  reason: string;
  domainStatus?: DomainStatus | null;
  confidence: number;
  verdict: VerdictType;
  tag?: string;
}

export type Phase = "upload" | "processing" | "results";

export interface BatchRequest {
  emails: Array<{ id: number; email: string; mxHost?: string | null }>;
  batchIndex: number;
}

export interface BatchResponse {
  batchIndex: number;
  total: number;
  results: VerifyResult[];
}

export interface Stats {
  total: number;
  valid: number;
  invalid: number;
  unknown: number;
  pending: number;
  verified: number;
  notVerified: number;
  uncertain: number;
}

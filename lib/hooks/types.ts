import type { VerifyResult } from "../types";
import type { DomainStatusCategory } from "../domainStatusLabel";

/**
 * Strictly additive superset of VerifyResult used by the UI layer, history
 * storage, and exports. Never consumed by lib/checks.ts, lib/classify.ts,
 * lib/domain.ts, lib/smtp.ts, or app/api/verify/route.ts.
 */
export interface EnrichedResult extends VerifyResult {
  domainCategory: DomainStatusCategory[];
  domain: string;
}

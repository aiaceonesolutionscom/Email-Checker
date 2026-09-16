import type { DomainResult } from "./domain";

export type DomainStatusCategory =
  | "Mail Active"
  | "Web Only"
  | "Parked"
  | "No Services"
  | "Rejects Email"
  | "Not Registered"
  | "DNS Unavailable";

export type Tone = "positive" | "negative" | "warning" | "informational" | "neutral";

export interface DomainStatusLabel {
  category: DomainStatusCategory;
  tone: Tone;
}

type DomainStatusInput = Pick<DomainResult, "status" | "hasMx" | "hasA" | "hasNullMx">;

/**
 * Presentation-only mapping over the fields verifyDomain() already returns.
 * Returns every category that applies, not just one - a domain can be both
 * "Parked" (parking-service NS/page) and "Rejects Email" (explicit null MX)
 * at the same time, and both facts are worth showing.
 */
const CATEGORY_TONE: Record<DomainStatusCategory, Tone> = {
  "Mail Active": "positive",
  "Web Only": "informational",
  "Parked": "negative",
  "No Services": "neutral",
  "Rejects Email": "negative",
  "Not Registered": "negative",
  "DNS Unavailable": "warning",
};

export function toneForCategory(category: DomainStatusCategory): Tone {
  return CATEGORY_TONE[category];
}

/**
 * domainCategory used to be stored as a single string in history/localStorage.
 * Older saved jobs still have that shape on disk, so normalize before use.
 */
export function asCategoryArray(
  c: DomainStatusCategory[] | DomainStatusCategory | null | undefined
): DomainStatusCategory[] {
  if (Array.isArray(c)) return c;
  return c ? [c] : [];
}

export function labelDomainStatus(
  d: DomainStatusInput | null | undefined
): DomainStatusLabel[] {
  if (!d) return [{ category: "DNS Unavailable", tone: "neutral" }];
  if (d.status === "FAKE") return [{ category: "Not Registered", tone: "negative" }];
  if (d.status === "UNKNOWN") return [{ category: "DNS Unavailable", tone: "warning" }];

  const tags: DomainStatusLabel[] = [];
  if (d.status === "PARKED") tags.push({ category: "Parked", tone: "negative" });
  if (d.hasNullMx) tags.push({ category: "Rejects Email", tone: "negative" });
  if (tags.length > 0) return tags;

  if (d.hasMx) return [{ category: "Mail Active", tone: "positive" }];
  if (d.hasA) return [{ category: "Web Only", tone: "informational" }];
  return [{ category: "No Services", tone: "neutral" }];
}

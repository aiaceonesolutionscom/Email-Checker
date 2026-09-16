import { Check, X, HelpCircle } from "lucide-react";
import { Badge } from "./Badge";
import { labelDomainStatus, toneForCategory, asCategoryArray } from "@/lib/domainStatusLabel";
import { verdictLabel, verdictTone, smtpLabel, smtpTone, statusTone } from "@/lib/verdictLabel";
import type { DomainResult } from "@/lib/domain";
import type { VerdictType, VerifyStatus } from "@/lib/types";
import type { DomainStatusCategory, Tone } from "@/lib/domainStatusLabel";

export function DomainStatusPill({
  domain,
}: {
  domain: Pick<DomainResult, "status" | "hasMx" | "hasA" | "hasNullMx"> | null | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {labelDomainStatus(domain).map(({ category, tone }) => (
        <Badge key={category} tone={tone}>{category}</Badge>
      ))}
    </div>
  );
}

export function DomainCategoryPill({ category, tone }: { category: DomainStatusCategory; tone: Tone }) {
  return <Badge tone={tone}>{category}</Badge>;
}

export function DomainCategoryPills({ categories }: { categories: DomainStatusCategory[] | DomainStatusCategory | null | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {asCategoryArray(categories).map((category) => (
        <Badge key={category} tone={toneForCategory(category)}>{category}</Badge>
      ))}
    </div>
  );
}

export function VerdictPill({ verdict, confidence }: { verdict: VerdictType; confidence?: number }) {
  const Icon = verdict === "Verified" ? Check : verdict === "Not Verified" ? X : HelpCircle;
  return (
    <Badge tone={verdictTone(verdict)} className="gap-1.5 px-2.5 py-1">
      <Icon size={12} strokeWidth={3} />
      <span>{verdictLabel(verdict)}</span>
      {typeof confidence === "number" && (
        <span className="font-mono opacity-70">{confidence}%</span>
      )}
    </Badge>
  );
}

export function SmtpPill({ status }: { status: VerifyStatus }) {
  return <Badge tone={smtpTone(status)}>{smtpLabel(status)}</Badge>;
}

export function StatusBadge({ status }: { status: VerifyStatus }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

export function CheckPill({ pass }: { pass: boolean | null }) {
  if (pass === null) return <Badge tone="neutral">—</Badge>;
  return <Badge tone={pass ? "positive" : "negative"}>{pass ? "Pass" : "Fail"}</Badge>;
}

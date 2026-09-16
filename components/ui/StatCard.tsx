import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import type { Tone } from "@/lib/domainStatusLabel";

const TONE_TEXT: Record<Tone, string> = {
  positive: "text-success-text",
  negative: "text-danger-text",
  warning: "text-warning-text",
  informational: "text-info-text",
  neutral: "text-slate-900",
};

const TONE_ICON_BG: Record<Tone, string> = {
  positive: "bg-success-subtle text-success-text",
  negative: "bg-danger-subtle text-danger-text",
  warning: "bg-warning-subtle text-warning-text",
  informational: "bg-info-subtle text-info-text",
  neutral: "bg-slate-100 text-slate-600",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={"mt-1.5 text-2xl font-bold " + TONE_TEXT[tone]}>{value}</p>
      </div>
      {Icon && (
        <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg " + TONE_ICON_BG[tone]}>
          <Icon size={18} />
        </div>
      )}
    </Card>
  );
}

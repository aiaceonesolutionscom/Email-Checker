import type { ReactNode } from "react";
import type { Tone } from "@/lib/domainStatusLabel";

const TONE_CLASSES: Record<Tone, string> = {
  positive: "bg-success-subtle text-success-text border-success-border",
  negative: "bg-danger-subtle text-danger-text border-danger-border",
  warning: "bg-warning-subtle text-warning-text border-warning-border",
  informational: "bg-info-subtle text-info-text border-info-border",
  neutral: "bg-neutral-subtle text-neutral-text border-neutral-border",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold " +
        TONE_CLASSES[tone] +
        " " +
        className
      }
    >
      {children}
    </span>
  );
}

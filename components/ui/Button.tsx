import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-500 shadow-sm shadow-brand-900/30 disabled:hover:bg-brand-600",
  secondary:
    "border border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-100 disabled:hover:border-slate-300 disabled:hover:bg-transparent",
  ghost: "text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent",
  danger:
    "border border-danger/40 text-danger hover:bg-danger/10 disabled:hover:bg-transparent",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
        VARIANT_CLASSES[variant] +
        " " +
        SIZE_CLASSES[size] +
        " " +
        className
      }
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

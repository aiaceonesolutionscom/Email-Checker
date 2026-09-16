export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={
            "rounded-md px-3 py-1.5 text-sm font-medium transition " +
            (value === opt.value
              ? "bg-brand-600 text-white"
              : "text-slate-500 hover:text-slate-900")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

const SIZE = 176;
const STROKE = 24;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_DEG = 3;

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let cumulativeDeg = 0;
  const arcs = segments.map((s, i) => {
    const share = total ? s.value / total : 0;
    const fullDeg = share * 360;
    const startDeg = cumulativeDeg;
    cumulativeDeg += fullDeg;
    const drawDeg = Math.max(fullDeg - GAP_DEG, 0);
    const arcLen = (drawDeg / 360) * CIRCUMFERENCE;
    return { ...s, i, startDeg, arcLen, pct: Math.round(share * 100) };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#eef1f5" strokeWidth={STROKE} />
          {arcs
            .filter((a) => a.value > 0)
            .map((a) => (
              <circle
                key={a.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={a.color}
                strokeWidth={hovered === a.i ? STROKE + 4 : STROKE}
                strokeLinecap="round"
                strokeDasharray={`${a.arcLen} ${CIRCUMFERENCE - a.arcLen}`}
                style={{
                  transform: `rotate(${a.startDeg - 90}deg)`,
                  transformOrigin: "50% 50%",
                  transition: "stroke-width 120ms ease, opacity 120ms ease",
                  opacity: hovered === null || hovered === a.i ? 1 : 0.55,
                  cursor: "pointer",
                }}
                tabIndex={0}
                role="button"
                aria-label={`${a.label}: ${a.value} (${a.pct}%)`}
                onMouseEnter={() => setHovered(a.i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(a.i)}
                onBlur={() => setHovered(null)}
              />
            ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-slate-900">
            {hovered !== null ? arcs[hovered].value : centerValue}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {hovered !== null ? `${arcs[hovered].pct}% ${arcs[hovered].label}` : centerLabel}
          </span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5" aria-hidden={false}>
        {arcs.map((a) => (
          <li
            key={a.label}
            className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm transition-colors"
            style={{ backgroundColor: hovered === a.i ? "#f3f5f8" : "transparent" }}
            onMouseEnter={() => setHovered(a.i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
              {a.label}
            </span>
            <span className="tabular-nums font-medium text-slate-900">
              {a.value} <span className="text-slate-400">&middot;</span> {a.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

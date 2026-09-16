import type { Stats } from "./types";
import type { EnrichedResult } from "./hooks/types";
import { initialStats } from "./stats";

const KEY = "ev.history.v1";
const MAX_JOBS = 50;
const MAX_ROWS_PER_JOB = 2000;

export interface HistoryJob {
  id: string;
  type: "single" | "bulk";
  label: string;
  createdAt: string;
  stats: Stats;
  rowCount: number;
  rows: EnrichedResult[];
  truncated: boolean;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readRaw(): HistoryJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(jobs: HistoryJob[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    try {
      const trimmed = jobs.slice(0, Math.max(0, jobs.length - 5));
      window.localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch {
      try {
        const statsOnly = jobs.map((j) => ({ ...j, rows: [], truncated: true }));
        window.localStorage.setItem(KEY, JSON.stringify(statsOnly));
      } catch {
        // give up silently — history is a UI convenience, never break the app
      }
    }
  }
}

export function getHistory(): HistoryJob[] {
  return readRaw().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getJob(id: string): HistoryJob | undefined {
  return readRaw().find((j) => j.id === id);
}

export function addHistoryJob(
  input: Omit<HistoryJob, "id" | "createdAt" | "rowCount" | "truncated">
): HistoryJob {
  const truncated = input.rows.length > MAX_ROWS_PER_JOB;
  const job: HistoryJob = {
    id: uid(),
    createdAt: new Date().toISOString(),
    type: input.type,
    label: input.label,
    stats: input.stats,
    rowCount: input.rows.length,
    rows: truncated ? input.rows.slice(0, MAX_ROWS_PER_JOB) : input.rows,
    truncated,
  };
  const jobs = readRaw();
  jobs.unshift(job);
  writeRaw(jobs.slice(0, MAX_JOBS));
  return job;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function aggregateStats(jobs: HistoryJob[]): Stats {
  const s = initialStats();
  for (const j of jobs) {
    s.total += j.stats.total;
    s.valid += j.stats.valid;
    s.invalid += j.stats.invalid;
    s.unknown += j.stats.unknown;
    s.pending += j.stats.pending;
    s.verified += j.stats.verified;
    s.notVerified += j.stats.notVerified;
    s.uncertain += j.stats.uncertain;
  }
  return s;
}

export function catchAllCount(jobs: HistoryJob[]): number {
  let n = 0;
  for (const j of jobs) {
    for (const r of j.rows) {
      if (r.smtp === "CATCHALL") n++;
    }
  }
  return n;
}

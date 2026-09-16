"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Table2, Trash2 } from "lucide-react";
import { getHistory, getJob, clearHistory, type HistoryJob } from "@/lib/history";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerdictPill, SmtpPill, DomainCategoryPills } from "@/components/ui/StatusPill";
import { asCategoryArray } from "@/lib/domainStatusLabel";
import { downloadVerified, downloadNotVerified, downloadFullReport, exportResults } from "@/lib/exportResults";
import type { EnrichedResult } from "@/lib/hooks/types";
import type { DomainStatusCategory } from "@/lib/domainStatusLabel";

const PAGE_SIZE = 25;

type FilterValue =
  | "all"
  | "Verified"
  | "Invalid"
  | "Unknown"
  | "Catch-All"
  | DomainStatusCategory;

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Verified", label: "Verified" },
  { value: "Invalid", label: "Invalid" },
  { value: "Unknown", label: "Unknown" },
  { value: "Catch-All", label: "Catch-All" },
  { value: "Mail Active", label: "Mail Active" },
  { value: "Web Only", label: "Web Only" },
  { value: "Parked", label: "Parked" },
  { value: "Rejects Email", label: "Rejects Email" },
  { value: "Not Registered", label: "Not Registered" },
  { value: "DNS Unavailable", label: "DNS Unavailable" },
];

function matchesFilter(r: EnrichedResult, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "Verified") return r.verdict === "Verified";
  if (filter === "Invalid") return r.verdict === "Not Verified";
  if (filter === "Unknown") return r.verdict === "Uncertain";
  if (filter === "Catch-All") return r.smtp === "CATCHALL";
  return asCategoryArray(r.domainCategory).includes(filter);
}

type SortKey = "email" | "status" | "date";

function ResultsPageInner() {
  const searchParams = useSearchParams();
  const jobParam = searchParams.get("job");

  const [job, setJob] = useState<HistoryJob | null | undefined>(undefined);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (jobParam) {
      setJob(getJob(jobParam) ?? null);
    } else {
      const jobs = getHistory();
      setJob(jobs[0] ?? null);
    }
  }, [jobParam]);

  const rows = job?.rows ?? [];

  const filtered = useMemo(() => {
    let list = rows.filter((r) => matchesFilter(r, filter));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.email.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === "email") return a.email.localeCompare(b.email) * dir;
      if (sortKey === "status") return a.status.localeCompare(b.status) * dir;
      return 0;
    });
    return list;
  }, [rows, filter, search, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key as SortKey);
      setSortDir("asc");
    }
    setPage(1);
  }

  const columns: DataTableColumn<EnrichedResult>[] = [
    { key: "email", header: "Email", sortable: true, render: (r) => <span className="font-mono text-xs">{r.email}</span> },
    {
      key: "domain",
      header: "Domain",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span>{r.domain}</span>
          <DomainCategoryPills categories={r.domainCategory} />
        </div>
      ),
    },
    { key: "mx", header: "MX", render: (r) => (r.mx === null ? "—" : r.mx ? "Pass" : "Fail") },
    { key: "smtp", header: "SMTP", render: (r) => <SmtpPill status={r.smtp} /> },
    { key: "status", header: "Final Status", sortable: true, render: (r) => <VerdictPill verdict={r.verdict} confidence={r.confidence} /> },
    { key: "date", header: "Checked At", sortable: true, render: () => (job ? new Date(job.createdAt).toLocaleString() : "—") },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <button
          onClick={() => navigator.clipboard?.writeText(r.email)}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-slate-400"
          title="Copy email"
        >
          <Copy size={12} /> Copy
        </button>
      ),
    },
  ];

  if (job === undefined) return null;

  if (!job) {
    return (
      <EmptyState
        icon={Table2}
        title="No results yet"
        description="Run a single check or a bulk verification to see results here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Results</h1>
          <p className="mt-1 text-sm text-slate-500">
            {job.label} · {job.rowCount} email{job.rowCount === 1 ? "" : "s"} · {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => downloadVerified(rows, "csv")}>Export Verified CSV</Button>
          <Button size="sm" variant="secondary" onClick={() => exportResults(filtered, "filtered_results", "csv")}>Export Filtered CSV</Button>
          <Button size="sm" variant="secondary" onClick={() => downloadFullReport(rows, "csv")}>Export Full CSV</Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              clearHistory();
              setJob(null);
            }}
          >
            <Trash2 size={13} /> Clear Results
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs options={FILTER_OPTIONS} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} />
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by email or domain..." className="sm:w-72" />
      </div>

      <Card className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          rows={pageRows}
          getRowKey={(r) => r.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          minWidth="900px"
          emptyMessage="No results match the current filter."
        />
        <Pagination page={safePage} pageCount={pageCount} totalItems={filtered.length} onChange={setPage} />
      </Card>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={null}>
      <ResultsPageInner />
    </Suspense>
  );
}

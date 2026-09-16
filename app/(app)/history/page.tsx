"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Mail, UploadCloud, Eye, Trash2 } from "lucide-react";
import { getHistory, clearHistory, type HistoryJob } from "@/lib/history";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);

  useEffect(() => {
    setJobs(getHistory());
  }, []);

  if (jobs === null) return null;

  const columns: DataTableColumn<HistoryJob>[] = [
    { key: "id", header: "Job ID", render: (j) => <span className="font-mono text-xs text-slate-500">{j.id.slice(0, 8)}</span> },
    {
      key: "type",
      header: "Type",
      render: (j) => (
        <span className="inline-flex items-center gap-1.5 text-slate-700">
          {j.type === "single" ? <Mail size={13} /> : <UploadCloud size={13} />}
          {j.type === "single" ? "Single" : "Bulk"}
        </span>
      ),
    },
    { key: "label", header: "Label", render: (j) => <span className="max-w-[220px] truncate text-slate-700">{j.label}</span> },
    { key: "total", header: "Total", render: (j) => j.stats.total },
    { key: "verified", header: "Verified", render: (j) => <Badge tone="positive">{j.stats.verified}</Badge> },
    { key: "invalid", header: "Invalid", render: (j) => <Badge tone="negative">{j.stats.notVerified}</Badge> },
    { key: "unknown", header: "Unknown", render: (j) => <Badge tone="warning">{j.stats.uncertain}</Badge> },
    { key: "date", header: "Date", render: (j) => new Date(j.createdAt).toLocaleString() },
    {
      key: "actions",
      header: "",
      render: (j) => (
        <Link href={`/results?job=${j.id}`}>
          <Button size="sm" variant="secondary">
            <Eye size={13} /> View Results
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Verification History</h1>
          <p className="mt-1 text-sm text-slate-500">Every single and bulk check you've run on this device.</p>
        </div>
        {jobs.length > 0 && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              clearHistory();
              setJobs([]);
            }}
          >
            <Trash2 size={13} /> Clear History
          </Button>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No verification history yet"
          description="Jobs you run from Single Email Check or Bulk Verification will appear here."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <DataTable columns={columns} rows={jobs} getRowKey={(j) => j.id} minWidth="800px" />
        </Card>
      )}
    </div>
  );
}

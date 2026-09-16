"use client";

import Link from "next/link";
import { useCallback } from "react";
import { FileSpreadsheet, ShieldCheck, Server, XCircle, Table2 } from "lucide-react";
import { useBulkVerification } from "@/lib/hooks/useBulkVerification";
import { useDragAndDrop } from "@/lib/hooks/useDragAndDrop";
import { Dropzone, DragOverlay } from "@/components/ui/Dropzone";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { DomainCategoryPills, VerdictPill } from "@/components/ui/StatusPill";
import { downloadVerified, downloadNotVerified, downloadFullReport } from "@/lib/exportResults";

export default function BulkVerificationPage() {
  const { phase, fileName, error, progress, stage, results, stats, jobId, handleFile, cancelProcessing, reset } =
    useBulkVerification();

  const onFileDrop = useCallback((file: File) => handleFile(file), [handleFile]);
  const { globalDrag } = useDragAndDrop(onFileDrop, phase === "upload");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Bulk Verification</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV, XLSX or TXT file to verify thousands of emails at once.
        </p>
      </div>

      <DragOverlay show={globalDrag && phase === "upload"} />

      {phase === "upload" && (
        <div className="mx-auto max-w-2xl space-y-6">
          <Dropzone onFile={handleFile} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: FileSpreadsheet, title: "Syntax", desc: "Format validation" },
              { icon: Server, title: "MX Records", desc: "Domain mail server check" },
              { icon: ShieldCheck, title: "SMTP", desc: "Real mailbox existence" },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="p-4">
                <Icon size={18} className="text-brand-400" />
                <p className="mt-2 font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-xs text-slate-500">{desc}</p>
              </Card>
            ))}
          </div>

          <div className="rounded-xl border border-warning-border bg-warning-subtle px-4 py-3 text-center text-xs text-warning">
            The file must have a column named <strong>Email</strong>. Files are processed
            in your browser and never stored anywhere.
          </div>

          {error && (
            <div className="rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="mx-auto max-w-2xl space-y-6">
          <Card className="p-6 sm:p-8">
            <h2 className="text-base font-semibold text-slate-900">Verifying {fileName}</h2>
            <p className="mt-1 text-sm text-slate-500">{stage}</p>

            <div className="mt-5">
              <ProgressBar value={progress} />
              <p className="mt-2 text-right text-sm font-semibold text-brand-300">{progress}%</p>
            </div>

            {stats.total > 0 && (
              <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" /> Verified: <b>{stats.verified}</b>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Invalid: <b>{stats.notVerified}</b>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-warning" /> Unknown: <b>{stats.uncertain}</b>
                </span>
              </div>
            )}

            <Button variant="secondary" size="sm" className="mt-6" onClick={cancelProcessing}>
              <XCircle size={14} /> Cancel
            </Button>
          </Card>

          {results.length > 0 && (
            <Card className="overflow-hidden p-0">
              <DataTable
                columns={[
                  { key: "email", header: "Email", render: (r) => <span className="font-mono text-xs">{r.email}</span> },
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
                  { key: "verdict", header: "Verified?", render: (r) => <VerdictPill verdict={r.verdict} /> },
                ]}
                rows={results.slice(0, 30)}
                getRowKey={(r) => r.id}
              />
            </Card>
          )}

          {error && (
            <div className="rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
      )}

      {phase === "results" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Verified" value={stats.verified} tone="positive" />
            <StatCard label="Invalid" value={stats.notVerified} tone="negative" />
            <StatCard label="Unknown" value={stats.uncertain} tone="warning" />
            <StatCard label="Total" value={stats.total} />
          </div>

          <Card className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-sm font-semibold text-slate-500">Download:</span>
            <Button size="sm" variant="secondary" onClick={() => downloadVerified(results, "csv")}>Verified CSV</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadVerified(results, "xlsx")}>Verified XLSX</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadNotVerified(results, "csv")}>Invalid CSV</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadNotVerified(results, "xlsx")}>Invalid XLSX</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadFullReport(results, "csv")}>Full Report CSV</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadFullReport(results, "xlsx")}>Full Report XLSX</Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={reset}>New File</Button>
          </Card>

          {jobId && (
            <Link href={`/results?job=${jobId}`}>
              <Button className="w-full sm:w-auto">
                <Table2 size={15} /> View Full Results Table
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

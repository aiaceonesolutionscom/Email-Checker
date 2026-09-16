"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  UploadCloud,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  CalendarClock,
  Inbox,
  History as HistoryIcon,
} from "lucide-react";
import { getHistory, aggregateStats, catchAllCount, isToday, type HistoryJob } from "@/lib/history";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { VerdictPill, DomainCategoryPills } from "@/components/ui/StatusPill";
import { DonutChart } from "@/components/ui/DonutChart";
import type { EnrichedResult } from "@/lib/hooks/types";

/**
 * Invalid uses #dc2626 rather than the app's --danger token (#f43f5e): adjacent
 * to the success green on a ring, #f43f5e fails the deuteranopia separation
 * check (Delta E 5.6, below the 6-8 floor); #dc2626 clears it at 12.8.
 */
const VERDICT_COLORS = { verified: "#10b981", invalid: "#dc2626", unknown: "#f59e0b" };

export default function DashboardPage() {
  const [jobs, setJobs] = useState<HistoryJob[] | null>(null);

  useEffect(() => {
    setJobs(getHistory());
  }, []);

  if (jobs === null) return null;

  const stats = aggregateStats(jobs);
  const todayJobs = jobs.filter((j) => isToday(j.createdAt));
  const todayTotal = aggregateStats(todayJobs).total;
  const catchAll = catchAllCount(jobs);
  const recentJobs = jobs.slice(0, 5);
  const recentRows: EnrichedResult[] = jobs[0]?.rows.slice(0, 8) ?? [];

  const recentColumns: DataTableColumn<EnrichedResult>[] = [
    { key: "email", header: "Email", render: (r) => <span className="font-mono text-xs">{r.email}</span> },
    { key: "domainCategory", header: "Domain Status", render: (r) => <DomainCategoryPills categories={r.domainCategory} /> },
    { key: "verdict", header: "Final Status", render: (r) => <VerdictPill verdict={r.verdict} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">An overview of your email verification activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Checked" value={stats.total} icon={Layers} />
        <StatCard label="Verified" value={stats.verified} icon={CheckCircle2} tone="positive" />
        <StatCard label="Invalid" value={stats.notVerified} icon={XCircle} tone="negative" />
        <StatCard label="Unknown" value={stats.uncertain} icon={HelpCircle} tone="warning" />
        <StatCard label="Catch-All" value={catchAll} icon={Inbox} tone="warning" />
        <StatCard label="Checked Today" value={todayTotal} icon={CalendarClock} tone="informational" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/single-check">
          <Button>
            <Mail size={15} /> Check Single Email
          </Button>
        </Link>
        <Link href="/bulk">
          <Button variant="secondary">
            <UploadCloud size={15} /> Upload CSV
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Recent Activity" subtitle="Your last few verification jobs" />
          <div className="p-3">
            {recentJobs.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">No activity yet.</p>
            ) : (
              <ul className="space-y-1">
                {recentJobs.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/results?job=${j.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100"
                    >
                      <span className="flex items-center gap-2 truncate text-slate-700">
                        {j.type === "single" ? <Mail size={14} className="shrink-0 text-slate-500" /> : <UploadCloud size={14} className="shrink-0 text-slate-500" />}
                        <span className="truncate">{j.label}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{new Date(j.createdAt).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Verification Statistics" subtitle="Breakdown across all checks" />
          <div className="p-5">
            {stats.total === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Run a check to see statistics.</p>
            ) : (
              <DonutChart
                centerLabel="Total Checked"
                centerValue={stats.total}
                segments={[
                  { label: "Verified", value: stats.verified, color: VERDICT_COLORS.verified },
                  { label: "Invalid", value: stats.notVerified, color: VERDICT_COLORS.invalid },
                  { label: "Unknown", value: stats.uncertain, color: VERDICT_COLORS.unknown },
                ]}
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader
          title="Recent Checks"
          subtitle={jobs[0] ? `From ${jobs[0].label}` : undefined}
          action={
            <Link href="/history">
              <Button size="sm" variant="ghost">
                <HistoryIcon size={13} /> View All
              </Button>
            </Link>
          }
        />
        {recentRows.length === 0 ? (
          <EmptyState icon={Inbox} title="No checks yet" description="Verify a single email or run a bulk job to see recent checks here." />
        ) : (
          <DataTable columns={recentColumns} rows={recentRows} getRowKey={(r) => r.id} />
        )}
      </Card>
    </div>
  );
}

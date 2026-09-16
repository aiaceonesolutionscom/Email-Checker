import { Card, CardHeader } from "@/components/ui/Card";
import { VerdictPill, SmtpPill, CheckPill, DomainCategoryPills } from "@/components/ui/StatusPill";
import type { EnrichedResult } from "@/lib/hooks/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function ResultCard({ result }: { result: EnrichedResult }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={result.email}
        subtitle={result.domain}
        action={<VerdictPill verdict={result.verdict} confidence={result.confidence} />}
      />
      <div>
        <Row label="Syntax">
          <CheckPill pass={result.syntax} />
        </Row>
        <Row label="Domain / DNS">
          <DomainCategoryPills categories={result.domainCategory} />
        </Row>
        <Row label="MX Record">
          <CheckPill pass={result.mx} />
        </Row>
        <Row label="SMTP Mailbox">
          <SmtpPill status={result.smtp} />
        </Row>
        <Row label="Disposable">
          <CheckPill pass={result.disposable === null ? null : !result.disposable} />
        </Row>
        <Row label="Role-based">
          <CheckPill pass={result.role === null ? null : !result.role} />
        </Row>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
        <p className="text-xs text-slate-500">{result.reason}</p>
      </div>
    </Card>
  );
}

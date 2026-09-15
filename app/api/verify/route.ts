import { NextResponse } from "next/server";
import dns from "dns/promises";
import { verifySmtp, probeCatchAll } from "@/lib/smtp";
import { checkDisposable, checkRole, checkSyntax, isBlockedProvider } from "@/lib/checks";
import { classifyFinal } from "@/lib/classify";
import type { BatchRequest, BatchResponse, VerifyResult, VerifyStatus } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 55;

const CONCURRENCY = 10;
const DELAY_MS = 100;
const catchAllCache = new Map<string, boolean>();

async function getMxHost(
  domain: string
): Promise<{ host: string | null; nullMx: boolean }> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) {
      mx.sort((a, b) => a.priority - b.priority);
      const exchange = mx[0].exchange.trim().replace(/\.$/, "");
      if (exchange === "") return { host: null, nullMx: true };
      return { host: exchange, nullMx: false };
    }
  } catch {}
  try {
    const addrs = await dns.resolve4(domain);
    if (addrs.length > 0) return { host: addrs[0], nullMx: false };
  } catch {}
  return { host: null, nullMx: false };
}

function makeResult(input: {
  id: number;
  email: string;
  originalRow: Record<string, string>;
  syntax: boolean;
  disposable: boolean;
  role: boolean;
  mx: boolean | null;
  smtp: VerifyStatus;
  providerBlocked?: boolean;
  domainStatus?: null;
}): VerifyResult {
  const { status, reason, confidence, verdict, tag } = classifyFinal(
    {
      syntax: input.syntax,
      disposable: input.disposable,
      role: input.role,
      domainStatus: input.domainStatus ?? null,
      mx: input.mx ?? false,
      smtp: input.smtp,
      providerBlocked: input.providerBlocked,
    },
    input.email.split("@")[1]
  );
  return {
    ...input,
    status,
    reason,
    confidence,
    verdict,
    tag,
    domainStatus: null,
  };
}

async function processEmail(input: {
  id: number;
  email: string;
  mxHost?: string | null;
  originalRow: Record<string, string>;
}): Promise<VerifyResult> {
  const { id, email, originalRow } = input;
  const syntax = checkSyntax(email);

  if (!syntax) {
    return makeResult({
      id, email, originalRow,
      syntax: false, disposable: false, role: false, mx: null,
      smtp: "N/A",
    });
  }

  const disposable = checkDisposable(email);
  const role = checkRole(email);

  const domain = email.split("@")[1];

  if (isBlockedProvider(domain)) {
    return makeResult({
      id, email, originalRow,
      syntax: true, disposable, role, mx: true,
      smtp: "UNKNOWN", providerBlocked: true,
    });
  }

  const providedMx = (input as any).mxHost;
  let mxHost: string | null = providedMx && typeof providedMx === "string" && providedMx.length > 0
    ? providedMx
    : null;
  let nullMx = false;

  if (!mxHost) {
    const resolvedMx = await getMxHost(domain);
    mxHost = resolvedMx.host;
    nullMx = resolvedMx.nullMx;
  }

  if (nullMx) {
    return makeResult({
      id, email, originalRow,
      syntax: true, disposable, role, mx: true,
      smtp: "N/A",
    });
  }

  if (!mxHost) {
    return makeResult({
      id, email, originalRow,
      syntax: true, disposable, role, mx: false,
      smtp: "N/A",
    });
  }

  const vResult = await verifySmtp(email, mxHost);
  const smtpRaw: VerifyStatus = vResult.status;

  let smtp: VerifyStatus = smtpRaw;
  if (smtpRaw === "VALID") {
    let catchAll = false;
    if (catchAllCache.has(domain)) {
      catchAll = catchAllCache.get(domain)!;
    } else {
      catchAll = await probeCatchAll(mxHost, domain, vResult.attempt);
      catchAllCache.set(domain, catchAll);
    }
    if (catchAll) smtp = "CATCHALL";
  }

  return makeResult({
    id, email, originalRow,
    syntax: true, disposable, role, mx: true, smtp,
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function POST(req: Request) {
  let body: BatchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
    return NextResponse.json({ error: "No emails provided" }, { status: 400 });
  }

  const emails = body.emails.map((e: any, i: number) => ({
    id: e.id ?? i,
    email: String(e.email).trim().toLowerCase(),
    mxHost: typeof e.mxHost === "string" ? e.mxHost : null,
    originalRow: (e as any).originalRow as Record<string, string> ?? {},
  }));

  const results = await mapWithConcurrency(emails, CONCURRENCY, processEmail);

  const response: BatchResponse = {
    batchIndex: body.batchIndex ?? 0,
    total: emails.length,
    results,
  };

  return NextResponse.json(response);
}

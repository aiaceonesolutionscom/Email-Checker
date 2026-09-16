export interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export type DnsProvider = "google" | "cloudflare";
export type DnsErrorType = "timeout" | "http" | "network" | "json" | "none";

export interface DnsQueryResult {
  ok: boolean;
  rcode: number | null;
  answers: DnsAnswer[];
  errorType: DnsErrorType;
  provider: DnsProvider | null;
}

export const RCODE_NOERROR = 0;
export const RCODE_SERVFAIL = 2;
export const RCODE_NXDOMAIN = 3;
export const RCODE_REFUSED = 5;

interface ProviderConfig {
  provider: DnsProvider;
  url: (name: string, type: string) => string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "google",
    url: (name, type) =>
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  },
  {
    provider: "cloudflare",
    url: (name, type) =>
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
        name
      )}&type=${type}`,
  },
];

function detectRcode(provider: DnsProvider, data: any): number | null {
  const raw = provider === "google" ? data?.Status : data?.status;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim()))
    return parseInt(raw, 10);
  return null;
}

function readAnswers(data: any): DnsAnswer[] {
  if (data && Array.isArray(data.Answer)) {
    return data.Answer.filter((a: any) => a && typeof a.data === "string");
  }
  return [];
}

function isAbortError(err: any): boolean {
  const name = err?.name ?? "";
  return name === "AbortError" || name === "TimeoutError";
}

export async function dnsFetch(
  name: string,
  type: string
): Promise<DnsQueryResult> {
  let firstError: DnsQueryResult | null = null;

  for (const { provider, url } of PROVIDERS) {
    let res: Response;
    try {
      res = await fetch(url(name, type), {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      const failure: DnsQueryResult = {
        ok: false,
        rcode: null,
        answers: [],
        errorType: isAbortError(err) ? "timeout" : "network",
        provider,
      };
      if (!firstError) firstError = failure;
      continue;
    }

    if (!res.ok) {
      const failure: DnsQueryResult = {
        ok: false,
        rcode: null,
        answers: [],
        errorType: "http",
        provider,
      };
      if (!firstError) firstError = failure;
      continue;
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      const failure: DnsQueryResult = {
        ok: false,
        rcode: null,
        answers: [],
        errorType: "json",
        provider,
      };
      if (!firstError) firstError = failure;
      continue;
    }

    const rcode = detectRcode(provider, data);
    if (rcode === null) {
      const failure: DnsQueryResult = {
        ok: false,
        rcode: null,
        answers: [],
        errorType: "json",
        provider,
      };
      if (!firstError) firstError = failure;
      continue;
    }

    const answers = readAnswers(data);

    if (rcode === RCODE_NOERROR || rcode === RCODE_NXDOMAIN) {
      return {
        ok: true,
        rcode,
        answers,
        errorType: "none",
        provider,
      };
    }

    const failure: DnsQueryResult = {
      ok: false,
      rcode,
      answers: [],
      errorType: "none",
      provider,
    };
    if (!firstError) firstError = failure;
  }

  return (
    firstError ?? {
      ok: false,
      rcode: null,
      answers: [],
      errorType: "network",
      provider: null,
    }
  );
}
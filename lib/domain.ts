import { dnsFetch } from "./dns-utils";
import type { DnsAnswer } from "./dns-utils";

export type DomainStatus = "REAL" | "PARKED" | "FAKE" | "NEW" | "UNKNOWN";

export interface DomainResult {
  domain: string;
  status: DomainStatus;
  hasNs: boolean;
  hasMx: boolean;
  hasA: boolean;
  hasSsl: boolean;
  ageDays: number | null;
  reason: string;
  hasNullMx: boolean;
  mxHost: string | null;
}

function readMxRecords(mxRecords: DnsAnswer[]) {
  const parsed = mxRecords
    .filter((r) => r.type === 15 && r.data && r.data.trim() !== "")
    .map((r) => {
      const match = r.data.trim().match(/^(\d+)\s+(.+)$/);
      const prio = match ? parseInt(match[1], 10) : 0;
      const exchange = match
        ? match[2].trim().replace(/\.$/, "") || "."
        : ".";
      return { prio, exchange };
    })
    .sort((a, b) => a.prio - b.prio);
  const hasMx = parsed.some((r) => r.exchange !== ".");
  const hasNullMx = parsed.length > 0 && !hasMx;
  const primary = parsed.find((r) => r.exchange !== ".")?.exchange ?? null;
  return { hasMx, hasNullMx, mxHost: primary };
}

function parseSoa(serial: string): number | null {
  const s = parseInt(serial, 10);
  if (isNaN(s) || s <= 0) return null;
  let date: Date | null = null;
  if (s > 1990000000 && s < 2100000000) {
    const dateNum = Math.floor(s / 100);
    const year = Math.floor(dateNum / 10000);
    const month = Math.floor((dateNum % 10000) / 100);
    const day = dateNum % 100;
    if (
      year >= 1990 && year <= 2100 &&
      month >= 1 && month <= 12 &&
      day >= 1 && day <= 31
    ) {
      date = new Date(year, month - 1, day);
    }
  } else if (s > 946684800 && s < 4102444800) {
    date = new Date(s * 1000);
  }
  if (!date || isNaN(date.getTime())) return null;
  const age = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  return age >= 0 ? age : null;
}

const PARKING_NS_MARKERS = [
  "afternic",
  "sedo",
  "bodis",
  "dan.com",
  "parkingcrew",
  "parklogic",
  "rookdns",
  "netfirms",
  "justhost",
];

const PARKING_URL_PATTERN = /(lander|parker|parking|forsale|for-sale|make-an-offer|makeanoffer|buydomains|afternic|sedo|bodis)/i;

const PARKING_TEXT_PATTERN = /(is for sale|domain parking|buy this domain|make offer|domain is parked|\/lander|\/parker|\/parking)/i;

function detectParkingNs(nsRecords: DnsAnswer[]): boolean {
  return nsRecords.some((r) =>
    PARKING_NS_MARKERS.some((m) => String(r.data).toLowerCase().includes(m))
  );
}

async function inspectWeb(domain: string): Promise<{ ssl: boolean; parked: boolean }> {
  const run = async (host: string) => {
    const res = await fetch(`https://${host}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    const ssl = res.ok || res.status < 500;
    let parked = false;
    try {
      if (PARKING_URL_PATTERN.test(res.url || "")) parked = true;
      if (!parked) {
        const text = await res.text();
        parked = PARKING_TEXT_PATTERN.test(text.slice(0, 4096));
      }
    } catch { /* body read failed */ }
    return { ssl, parked };
  };
  try {
    return await run(domain);
  } catch {
    try {
      return await run(`www.${domain}`);
    } catch {
      return { ssl: false, parked: false };
    }
  }
}

export async function verifyDomain(domain: string): Promise<DomainResult> {
  try {
    const [ns, mx, a, aaaa, soa] = await Promise.all([
      dnsFetch(domain, "NS"),
      dnsFetch(domain, "MX"),
      dnsFetch(domain, "A"),
      dnsFetch(domain, "AAAA"),
      dnsFetch(domain, "SOA"),
    ]);

    const nsRecords = ns.answers;
    const mxRecords = mx.answers;
    const aRecords = a.answers;
    const soaRecords = soa.answers;

    const hasNs = nsRecords.length > 0;
    const { hasMx, hasNullMx, mxHost } = readMxRecords(mxRecords);
    const hasA =
      aRecords.some((r) => r.type === 1) ||
      aaaa.answers.some((r) => r.type === 28);

    let ageDays: number | null = null;
    if (soaRecords.length > 0) {
      const soaRec = soaRecords.find((r) => r.type === 6);
      if (soaRec) {
        const parts = soaRec.data.split(" ");
        if (parts.length >= 3) {
          ageDays = parseSoa(parts[2]);
        }
      }
    }

    if (!hasNs) {
      return {
        domain,
        status: "FAKE",
        hasNs: false,
        hasMx: false,
        hasA: false,
        hasSsl: false,
        ageDays: null,
        reason: "Domain not registered (no NS records)",
        hasNullMx: false,
        mxHost: null,
      };
    }

    let hasSsl = false;
    let parkingHttp = false;
    if (hasA || hasMx) {
      const inspected = await inspectWeb(domain);
      hasSsl = inspected.ssl;
      if (!hasMx) parkingHttp = inspected.parked;
    }

    const parkingNs = detectParkingNs(nsRecords);

    if (!hasMx && (!hasA || parkingNs || parkingHttp)) {
      const reason = parkingNs || parkingHttp
        ? "Domain registered but appears parked (no mail service)"
        : "Domain registered but no mail or web server";
      return {
        domain,
        status: "PARKED",
        hasNs: true,
        hasMx: false,
        hasA,
        hasSsl,
        ageDays,
        reason,
        hasNullMx,
        mxHost: null,
      };
    }

    return {
      domain,
      status: "REAL",
      hasNs: true,
      hasMx,
      hasA,
      hasSsl,
      ageDays,
      reason: "Domain verified - active",
      hasNullMx,
      mxHost,
    };
  } catch {
    return {
      domain,
      status: "UNKNOWN",
      hasNs: false,
      hasMx: false,
      hasA: false,
      hasSsl: false,
      ageDays: null,
      reason: "DNS lookup failed",
      hasNullMx: false,
      mxHost: null,
    };
  }
}
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
}

interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

async function dnsFetch(name: string, type: string): Promise<DnsAnswer[]> {
  const providers = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
  ];
  for (const url of providers) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.Answer && Array.isArray(data.Answer)) {
        return data.Answer.filter((a: any) => typeof a.data === "string");
      }
    } catch {
      continue;
    }
  }
  return [];
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

async function checkSsl(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    return res.ok || res.status < 500;
  } catch {
    try {
      const res = await fetch(`https://www.${domain}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }
}

export async function verifyDomain(domain: string): Promise<DomainResult> {
  try {
    const [nsRecords, mxRecords, aRecords, soaRecords] = await Promise.all([
      dnsFetch(domain, "NS"),
      dnsFetch(domain, "MX"),
      dnsFetch(domain, "A"),
      dnsFetch(domain, "SOA"),
    ]);

    const hasNs = nsRecords.length > 0;
    const hasMx = mxRecords.some(
      (r) => r.type === 15 && r.data && r.data.trim() !== "."
    );
    const hasA = aRecords.some((r) => r.type === 1);

    let ageDays: number | null = null;
    if (soaRecords.length > 0) {
      const soa = soaRecords.find((r) => r.type === 6);
      if (soa) {
        const parts = soa.data.split(" ");
        if (parts.length >= 3) {
          ageDays = parseSoa(parts[2]);
        }
      }
    }

    let hasSsl = false;
    if (hasA || hasMx) {
      hasSsl = await checkSsl(domain);
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
      };
    }

    if (!hasMx && !hasA) {
      return {
        domain,
        status: "PARKED",
        hasNs: true,
        hasMx: false,
        hasA: false,
        hasSsl,
        ageDays,
        reason: "Domain registered but no mail or web server",
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
    };
  }
}
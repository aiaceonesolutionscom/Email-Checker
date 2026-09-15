interface MxRecord {
  exchange: string;
  priority: number;
}

function parseMx(answers: any[]): MxRecord[] {
  return answers
    .filter((r: any) => r.type === 15)
    .map((r: any) => {
      const str = String(r.data ?? "");
      const match = str.match(/^(\d+)\s+(.+)$/);
      if (match) {
        return {
          exchange: match[2].replace(/\.$/, ""),
          priority: parseInt(match[1], 10),
        };
      }
      return { exchange: str.replace(/\.$/, ""), priority: 0 };
    })
    .sort((a: any, b: any) => a.priority - b.priority);
}

async function dnsFetch(
  name: string,
  type: string
): Promise<any[]> {
  const providers = [
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
      name
    )}&type=${type}`,
  ];
  for (const url of providers) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.Answer && Array.isArray(data.Answer)) {
        const valid = data.Answer.filter(
          (a: any) => typeof a.data === "string"
        );
        if (valid.length > 0) return valid;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function checkMxRecord(domain: string): Promise<boolean> {
  try {
    const mx = await dnsFetch(domain, "MX");
    if (mx.length > 0) return true;
    const a = await dnsFetch(domain, "A");
    if (a.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

export async function getMxHost(domain: string): Promise<string | null> {
  try {
    const mx = parseMx(await dnsFetch(domain, "MX"));
    if (mx.length > 0) {
      if (mx[0].exchange === "") return null;
      return mx[0].exchange;
    }
    const a = await dnsFetch(domain, "A");
    if (a.length > 0) return String(a[0].data).split(",")[0].trim();
    return null;
  } catch {
    return null;
  }
}
import { dnsFetch } from "./dns-utils";

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

export async function checkMxRecord(domain: string): Promise<boolean> {
  try {
    const mx = await dnsFetch(domain, "MX");
    if (mx.answers.length > 0) return true;
    const a = await dnsFetch(domain, "A");
    if (a.answers.length > 0) return true;
    return false;
  } catch {
    return false;
  }
}

export async function getMxHost(domain: string): Promise<string | null> {
  try {
    const mx = parseMx((await dnsFetch(domain, "MX")).answers);
    if (mx.length > 0) {
      if (mx[0].exchange === "") return null;
      return mx[0].exchange;
    }
    const a = await dnsFetch(domain, "A");
    if (a.answers.length > 0) return String(a.answers[0].data).split(",")[0].trim();
    return null;
  } catch {
    return null;
  }
}
import { readFileSync } from "fs";
import { checkSyntax, checkDisposable } from "../lib/checks.ts";
import { verifyDomain, type DomainStatus } from "../lib/domain.ts";
import { getMxHost } from "../lib/dns.ts";
import type { VerifyStatus } from "../lib/types.ts";

const API = "http://localhost:3003/api/verify";
const BATCH = 40;

interface TestRow {
  email: string;
  expected: string;
  category: string;
}

function parseCsv(path: string): TestRow[] {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const iEmail = header.indexOf("Email");
  const iExp = header.indexOf("Expected");
  const iCat = header.indexOf("Category");
  const rows: TestRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    rows.push({
      email: parts[iEmail].trim(),
      expected: parts[iExp].trim(),
      category: parts[iCat]?.trim() ?? "",
    });
  }
  return rows;
}

async function main() {
  const rows = parseCsv("test-data/accuracy.csv");
  console.log(`Loaded ${rows.length} test emails\n`);

  interface MxInfo {
    mx: boolean;
    mxHost: string | null;
    domainStatus: DomainStatus | null;
  }

  const mxMap = new Map<string, MxInfo>();

  const smtpBatch: Array<{ id: number; email: string; mxHost: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const { email } = rows[i];
    const syntax = checkSyntax(email);
    const disposable = checkDisposable(email);

    if (!syntax) {
      mxMap.set(email, { mx: false, mxHost: null, domainStatus: null });
      continue;
    }

    const domain = email.split("@")[1];
    const dr = await verifyDomain(domain);
    const ds = dr.status;

    if (ds === "FAKE" || ds === "PARKED" || ds === "NEW") {
      mxMap.set(email, { mx: false, mxHost: null, domainStatus: ds });
      continue;
    }

    const mh = await getMxHost(domain);
    if (!mh) {
      mxMap.set(email, { mx: false, mxHost: null, domainStatus: ds });
      continue;
    }

    mxMap.set(email, { mx: true, mxHost: mh, domainStatus: ds });
    smtpBatch.push({ id: i, email, mxHost: mh });
  }

  const smtpResults = new Map<number, string>();
  for (let b = 0; b < smtpBatch.length; b += BATCH) {
    const slice = smtpBatch.slice(b, b + BATCH);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchIndex: b / BATCH,
        emails: slice.map((c) => ({ id: c.id, email: c.email, mxHost: c.mxHost })),
      }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    for (const r of data.results) {
      smtpResults.set(r.id, r.smtp as string);
    }
  }

  let pass = 0;
  let fail = 0;
  const catStats = new Map<string, { pass: number; fail: number }>();

  console.log("Email | Expected | Actual | Result | Category");
  console.log("-".repeat(100));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { email, expected, category } = row;
    const info = mxMap.get(email)!;

    const syntax = checkSyntax(email);
    const disposable = checkDisposable(email);

    let actual: string;
    if (!syntax) {
      actual = "INVALID";
    } else if (info.domainStatus === "FAKE") {
      actual = "INVALID";
    } else if (info.domainStatus === "PARKED") {
      actual = "INVALID";
    } else if (info.domainStatus === "NEW") {
      actual = "UNKNOWN";
    } else if (disposable) {
      actual = "INVALID";
    } else if (!info.mx) {
      actual = "INVALID";
    } else {
      const smtp = smtpResults.get(i) as VerifyStatus;
      if (smtp === "VALID") actual = "VALID";
      else if (smtp === "INVALID") actual = "INVALID";
      else if (smtp === "CATCHALL") actual = "UNKNOWN";
      else actual = "UNKNOWN";
    }

    const ok = actual === expected;
    if (ok) pass++; else fail++;
    const st = catStats.get(category) ?? { pass: 0, fail: 0 };
    if (ok) st.pass++; else st.fail++;
    catStats.set(category, st);

    console.log(
      `${email} | ${expected.padEnd(8)} | ${actual.padEnd(8)} | ${ok ? "PASS" : "FAIL"} | ${category}`
    );
  }

  console.log("\n" + "=".repeat(50));
  console.log(`TOTAL: ${pass}/${rows.length} (${((pass / rows.length) * 100).toFixed(1)}%)`);
  console.log("\nPER CATEGORY:");
  for (const [cat, s] of [...catStats.entries()].sort()) {
    const total = s.pass + s.fail;
    const pct = total ? ((s.pass / total) * 100).toFixed(0) : "0";
    console.log(`  ${cat.padEnd(20)} ${s.pass}/${total} (${pct}%)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
import { toCSV, toXLSX, downloadBlob } from "./parse";
import { smtpLabel } from "./verdictLabel";
import { asCategoryArray } from "./domainStatusLabel";
import type { EnrichedResult } from "./hooks/types";

function fmtPass(v: boolean | null) {
  return v === null ? "-" : v ? "Pass" : "Fail";
}
function fmtYes(v: boolean | null) {
  return v === null ? "-" : v ? "Yes" : "No";
}

export function resultToRow(r: EnrichedResult): Record<string, string> {
  return {
    ...r.originalRow,
    Email: r.email,
    Domain: r.domain,
    "Domain Status": asCategoryArray(r.domainCategory).join(", "),
    Mailbox: smtpLabel(r.smtp),
    "Confidence (%)": String(r.confidence),
    "Verified?": r.verdict,
    Tag: r.tag ?? "",
    Syntax: fmtPass(r.syntax),
    Disposable: fmtYes(r.disposable),
    "Role-Based": fmtYes(r.role),
    MX: fmtPass(r.mx),
    SMTP: r.smtp,
    Status: r.status,
    Reason: r.reason,
  };
}

export function exportResults(
  results: EnrichedResult[],
  filenameBase: string,
  type: "csv" | "xlsx"
) {
  const rows = results.map(resultToRow);
  if (rows.length === 0) return;
  if (type === "csv") {
    // Prepend a UTF-8 BOM so Excel and other spreadsheet apps don't
    // misinterpret any non-ASCII bytes (mojibake) when opening the file.
    downloadBlob("﻿" + toCSV(rows), `${filenameBase}.csv`, "text/csv;charset=utf-8");
  } else {
    downloadBlob(
      toXLSX(rows, filenameBase.slice(0, 31)),
      `${filenameBase}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  }
}

export function downloadVerified(results: EnrichedResult[], type: "csv" | "xlsx") {
  exportResults(results.filter((r) => r.verdict === "Verified"), "verified_emails", type);
}

export function downloadNotVerified(results: EnrichedResult[], type: "csv" | "xlsx") {
  exportResults(results.filter((r) => r.verdict === "Not Verified"), "not_verified_emails", type);
}

export function downloadFullReport(results: EnrichedResult[], type: "csv" | "xlsx") {
  exportResults(results, "full_report", type);
}

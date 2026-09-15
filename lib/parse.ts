import * as XLSX from "xlsx";
import type { EmailRecord } from "./types";

export function parseFile(buffer: ArrayBuffer, fileName: string): EmailRecord[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in file");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  if (rows.length === 0) throw new Error("File is empty or has no data rows");

  const headers = Object.keys(rows[0]);
  const emailCol = headers.find(
    (h) => h.toLowerCase().trim() === "email"
  );
  if (!emailCol) {
    throw new Error(
      `No "Email" column found. Available columns: ${headers.join(", ")}`
    );
  }

  const records: EmailRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const val = rows[i][emailCol];
    if (val && typeof val === "string" && val.trim().length > 0) {
      records.push({
        id: i + 1,
        email: val.trim().toLowerCase(),
        originalRow: rows[i],
      });
    }
  }
  return records;
}

export function toCSV(
  records: Array<Record<string, any>>
): string {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0]);
  const lines = [headers.join(",")];
  for (const row of records) {
    const vals = headers.map((h) => {
      const v = String(row[h] ?? "");
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    });
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

export function toXLSX(
  records: Array<Record<string, any>>,
  sheetName: string = "Results"
): ArrayBuffer {
  const sheet = XLSX.utils.json_to_sheet(records);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

export function downloadBlob(data: ArrayBuffer | string, fileName: string, mime: string) {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime })
      : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

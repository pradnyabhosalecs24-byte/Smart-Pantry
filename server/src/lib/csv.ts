// CSV helpers. Export escapes cells that spreadsheet apps would run as formulas
// (=, +, -, @ at the start) — this blocks "CSV injection" attacks.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Builds a CSV string with a UTF-8 BOM so Excel shows ₹ and non-English names correctly. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

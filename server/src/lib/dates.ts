// All calendar dates are handled as "YYYY-MM-DD" strings.
// Expiry is a calendar day, not a moment in time, so we never compare raw timestamps:
// "today" is computed in the user's own time zone, which avoids items flipping status
// at the wrong hour (e.g. 05:30 IST = midnight UTC).

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function todayInTz(tz: string, now: Date = new Date()): string {
  const zone = isValidTimezone(tz) ? tz : "UTC";
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Rejects impossible dates such as 2026-02-30 or 2025-02-29. */
export function isValidDateStr(s: unknown): boolean {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Converts "YYYY-MM-DD" to the UTC-midnight Date Prisma uses for @db.Date columns. */
export function dateStrToDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function dateToStr(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function addDays(s: string, n: number): string {
  const d = dateStrToDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToStr(d)!;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return Math.round((dateStrToDate(to).getTime() - dateStrToDate(from).getTime()) / 86_400_000);
}

export function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/** "2026-10" style month key for a timestamp, in the user's zone. */
export function monthKey(d: Date, tz: string): string {
  return todayInTz(tz, d).slice(0, 7);
}

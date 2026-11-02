const CURRENCY_LOCALE: Record<string, string> = { INR: "en-IN", USD: "en-US", EUR: "de-DE", GBP: "en-GB", JPY: "ja-JP" };

export function money(value: number | null | undefined, currency = "INR") {
  if (value == null) return "—";
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function qty(value: number, unit: string) {
  const n = Number.isInteger(value) ? value : Number(value.toFixed(3));
  return `${n.toLocaleString("en-IN")} ${unit}`;
}

/** 62.069 -> 62, 0.362 -> 0.36 — enough precision for a forecast. */
export function rate(n: number) {
  return n >= 10 ? Math.round(n).toLocaleString("en-IN") : String(Number(n.toFixed(2)));
}

/** "26 Oct 2026" from "2026-10-26" without time-zone shifts. */
export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return fmtDate(iso);
}

export function daysLeftText(daysLeft: number | null, noExpiry = false) {
  if (daysLeft == null) return noExpiry ? "No expiry" : "Date missing";
  if (daysLeft < -1) return `Expired ${-daysLeft} days ago`;
  if (daysLeft === -1) return "Expired yesterday";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  return `${daysLeft} days left`;
}

export function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const monthLabel = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
};

export const WASTE_REASONS: { value: string; label: string }[] = [
  { value: "EXPIRED", label: "Went past its date" },
  { value: "SPOILED", label: "Spoiled or mouldy" },
  { value: "LEFTOVER", label: "Leftover not eaten" },
  { value: "OVERBOUGHT", label: "Bought too much" },
  { value: "DAMAGED", label: "Damaged or spilled" },
  { value: "OTHER", label: "Other" },
];
export const reasonLabel = (r: string | null) => WASTE_REASONS.find((x) => x.value === r)?.label ?? "Other";

export const UNITS = [
  { value: "g", label: "g — grams", group: "mass" },
  { value: "kg", label: "kg — kilograms", group: "mass" },
  { value: "ml", label: "ml — millilitres", group: "volume" },
  { value: "l", label: "l — litres", group: "volume" },
  { value: "pcs", label: "pcs — pieces", group: "count" },
  { value: "dozen", label: "dozen", group: "count" },
  { value: "pack", label: "pack", group: "pack" },
  { value: "bottle", label: "bottle", group: "bottle" },
  { value: "can", label: "can", group: "can" },
  { value: "box", label: "box", group: "box" },
];
export const compatibleUnits = (unit: string) => {
  const g = UNITS.find((u) => u.value === unit)?.group;
  return UNITS.filter((u) => u.group === g);
};

const FRACTIONS: [number, string][] = [[0.25, "¼"], [0.33, "⅓"], [0.5, "½"], [0.67, "⅔"], [0.75, "¾"]];

/** Kitchen-friendly amounts: 0.5 tsp → ½ tsp, 1500 g → 1.5 kg, null → "to taste". */
export function fmtAmount(q: number | null, unit: string): string {
  if (q == null) return "to taste";
  let v = q;
  let u = unit;
  if (u === "g" && v >= 1000) { v = v / 1000; u = "kg"; }
  if (u === "ml" && v >= 1000) { v = v / 1000; u = "l"; }
  const whole = Math.floor(v);
  const frac = v - whole;
  let text: string;
  if (["tsp", "tbsp", "cup", "pcs"].includes(u)) {
    const f = FRACTIONS.find(([n]) => Math.abs(frac - n) < 0.05);
    if (frac < 0.05) text = String(whole);
    else if (f) text = whole ? `${whole}${f[1]}` : f[1];
    else text = String(Number(v.toFixed(2)));
  } else text = String(u === "g" || u === "ml" ? Math.round(v) : Number(v.toFixed(2)));
  const label = u === "pcs" ? "" : ` ${u}`;
  return `${text}${label}`;
}

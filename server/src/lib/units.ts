// Units in the same group can be converted (g <-> kg, ml <-> l, pcs <-> dozen).
// Different groups (kg vs pcs) are never mixed, so totals are always meaningful.

export const UNITS = {
  g: { group: "mass", factor: 1, label: "grams" },
  kg: { group: "mass", factor: 1000, label: "kilograms" },
  ml: { group: "volume", factor: 1, label: "millilitres" },
  l: { group: "volume", factor: 1000, label: "litres" },
  pcs: { group: "count", factor: 1, label: "pieces" },
  dozen: { group: "count", factor: 12, label: "dozen" },
  pack: { group: "pack", factor: 1, label: "packs" },
  bottle: { group: "bottle", factor: 1, label: "bottles" },
  can: { group: "can", factor: 1, label: "cans" },
  box: { group: "box", factor: 1, label: "boxes" },
} as const;

export type Unit = keyof typeof UNITS;
export const UNIT_LIST = Object.keys(UNITS) as Unit[];

export function isUnit(u: unknown): u is Unit {
  return typeof u === "string" && u in UNITS;
}

export function compatibleUnits(unit: Unit): Unit[] {
  return UNIT_LIST.filter((u) => UNITS[u].group === UNITS[unit].group);
}

/** Returns null when the units cannot be converted (different groups). */
export function convert(quantity: number, from: Unit, to: Unit): number | null {
  if (from === to) return quantity;
  if (UNITS[from].group !== UNITS[to].group) return null;
  return roundQty((quantity * UNITS[from].factor) / UNITS[to].factor);
}

/** Normalises mass to kg and volume to litres for reporting totals. */
export function toReportingUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  if (!isUnit(unit)) return { quantity, unit };
  const group = UNITS[unit].group;
  if (group === "mass") return { quantity: convert(quantity, unit, "kg")!, unit: "kg" };
  if (group === "volume") return { quantity: convert(quantity, unit, "l")!, unit: "l" };
  if (group === "count") return { quantity: convert(quantity, unit, "pcs")!, unit: "pcs" };
  return { quantity, unit };
}

// Quantities are stored with 3 decimals. Doing arithmetic in integer "milli-units"
// avoids floating point errors such as 0.1 + 0.2 = 0.30000000000000004.
export const toMilli = (q: number): number => Math.round(q * 1000);
export const fromMilli = (m: number): number => m / 1000;
export const roundQty = (q: number): number => fromMilli(toMilli(q));

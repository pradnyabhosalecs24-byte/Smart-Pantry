import { addDays, diffDays } from "./dates.js";

export interface ConsumptionPoint {
  date: string; // YYYY-MM-DD (user's zone)
  quantity: number; // in the item's unit
}

export interface RunOutPrediction {
  dailyRate: number;
  daysLeft: number;
  runOutDate: string;
  basedOnDays: number;
  eventCount: number;
  confidence: "low" | "medium" | "high";
}

/**
 * Simple, explainable forecast: average daily consumption over the recent window,
 * then current stock / daily rate = days left. Needs at least 2 consumption records.
 * It is an estimate and the UI labels it as one.
 */
export function predictRunOut(
  currentQty: number,
  history: ConsumptionPoint[],
  today: string,
  windowDays = 30,
): RunOutPrediction | null {
  if (currentQty <= 0) return null;
  const windowStart = addDays(today, -windowDays);
  const recent = history.filter((h) => h.date >= windowStart && h.date <= today && h.quantity > 0);
  if (recent.length < 2) return null;

  const first = recent.reduce((min, h) => (h.date < min ? h.date : min), recent[0].date);
  // At least a week of observation so two records on one day don't produce a wild rate
  const basedOnDays = Math.max(diffDays(first, today), 7);
  const total = recent.reduce((s, h) => s + h.quantity, 0);
  const dailyRate = total / basedOnDays;
  if (dailyRate <= 0) return null;

  const daysLeft = Math.floor(currentQty / dailyRate);
  return {
    dailyRate: Math.round(dailyRate * 1000) / 1000,
    daysLeft,
    runOutDate: addDays(today, daysLeft),
    basedOnDays,
    eventCount: recent.length,
    confidence: recent.length >= 6 ? "high" : recent.length >= 3 ? "medium" : "low",
  };
}

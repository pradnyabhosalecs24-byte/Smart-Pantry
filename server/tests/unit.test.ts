import { describe, expect, it } from "vitest";
import { toCsv, csvCell } from "../src/lib/csv.js";
import { addDays, diffDays, isValidDateStr, todayInTz } from "../src/lib/dates.js";
import { planFefo } from "../src/lib/fefo.js";
import { predictRunOut } from "../src/lib/predictions.js";
import { suggestRecipes } from "../src/lib/recipes.js";
import { effectiveExpiry, expiryStatus, isLowStock, worstStatus } from "../src/lib/status.js";
import { convert, roundQty, toReportingUnit } from "../src/lib/units.js";
import { normaliseDate } from "../src/services/importer.js";

describe("dates", () => {
  it("computes 'today' in the user's time zone, not UTC", () => {
    // 20:00 UTC on 26 Oct is already 01:30 on 27 Oct in India
    const moment = new Date("2026-10-26T20:00:00Z");
    expect(todayInTz("UTC", moment)).toBe("2026-10-26");
    expect(todayInTz("Asia/Kolkata", moment)).toBe("2026-10-27");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(todayInTz("Not/AZone", new Date("2026-10-26T10:00:00Z"))).toBe("2026-10-26");
  });
  it("rejects impossible dates and accepts leap days", () => {
    expect(isValidDateStr("2026-02-30")).toBe(false);
    expect(isValidDateStr("2025-02-29")).toBe(false);
    expect(isValidDateStr("2028-02-29")).toBe(true);
    expect(isValidDateStr("26-10-2026")).toBe(false);
  });
  it("adds and diffs days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-10-26", "2026-11-02")).toBe(7);
    expect(diffDays("2026-10-26", "2026-10-25")).toBe(-1);
  });
});

describe("expiry status", () => {
  const today = "2026-10-26";
  it("classifies expired / expiring / safe using the warning period", () => {
    expect(expiryStatus("2026-10-25", today, 7, false)).toEqual({ status: "EXPIRED", daysLeft: -1 });
    expect(expiryStatus("2026-10-26", today, 7, false)).toEqual({ status: "EXPIRING", daysLeft: 0 });
    expect(expiryStatus("2026-11-02", today, 7, false)).toEqual({ status: "EXPIRING", daysLeft: 7 });
    expect(expiryStatus("2026-11-03", today, 7, false)).toEqual({ status: "SAFE", daysLeft: 8 });
  });
  it("never treats a missing date as safe", () => {
    expect(expiryStatus(null, today, 7, false).status).toBe("NO_DATE");
    expect(expiryStatus(null, today, 7, true).status).toBe("NO_EXPIRY");
  });
  it("uses the opened date when it comes before the printed date", () => {
    expect(effectiveExpiry("2026-12-01", "2026-10-20", 4)).toEqual({ date: "2026-10-24", reason: "OPENED" });
    expect(effectiveExpiry("2026-10-22", "2026-10-20", 4)).toEqual({ date: "2026-10-22", reason: "PRINTED" });
    expect(effectiveExpiry("2026-12-01", "2026-10-20", null)).toEqual({ date: "2026-12-01", reason: "PRINTED" });
  });
  it("item status is the most urgent batch; no stock means out of stock", () => {
    expect(worstStatus(["SAFE", "EXPIRING", "NO_EXPIRY"])).toBe("EXPIRING");
    expect(worstStatus(["SAFE", "EXPIRED"])).toBe("EXPIRED");
    expect(worstStatus([])).toBe("OUT_OF_STOCK");
  });
  it("low stock is independent of expiry", () => {
    expect(isLowStock(1, 2)).toBe(true);
    expect(isLowStock(2, 2)).toBe(true);
    expect(isLowStock(3, 2)).toBe(false);
    expect(isLowStock(5, 0)).toBe(false);
    expect(isLowStock(0, 0)).toBe(true);
  });
});

describe("units", () => {
  it("converts within a group and refuses across groups", () => {
    expect(convert(250, "g", "kg")).toBe(0.25);
    expect(convert(1.5, "l", "ml")).toBe(1500);
    expect(convert(2, "dozen", "pcs")).toBe(24);
    expect(convert(1, "kg", "pcs")).toBeNull();
  });
  it("avoids floating point drift", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
  it("normalises report units", () => {
    expect(toReportingUnit(500, "g")).toEqual({ quantity: 0.5, unit: "kg" });
    expect(toReportingUnit(3, "can")).toEqual({ quantity: 3, unit: "can" });
  });
});

describe("FEFO", () => {
  const t = new Date("2026-01-01");
  it("takes from the batch that expires first", () => {
    const plan = planFefo(
      [
        { id: "late", quantity: 1, expiry: "2026-11-10", createdAt: t },
        { id: "soon", quantity: 1, expiry: "2026-10-28", createdAt: t },
        { id: "nodate", quantity: 5, expiry: null, createdAt: t },
      ],
      1.5,
    );
    expect(plan.allocations).toEqual([
      { batchId: "soon", take: 1, remaining: 0 },
      { batchId: "late", take: 0.5, remaining: 0.5 },
    ]);
    expect(plan.shortfall).toBe(0);
  });
  it("reports a shortfall instead of going negative", () => {
    const plan = planFefo([{ id: "a", quantity: 0.3, expiry: "2026-11-01", createdAt: t }], 0.5);
    expect(plan.allocations[0]).toEqual({ batchId: "a", take: 0.3, remaining: 0 });
    expect(plan.shortfall).toBe(0.2);
  });
});

describe("run-out prediction", () => {
  it("needs at least two records", () => {
    expect(predictRunOut(5, [{ date: "2026-10-20", quantity: 1 }], "2026-10-26")).toBeNull();
  });
  it("estimates days left from the recent daily rate", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ date: addDays("2026-10-26", -(i * 2 + 1)), quantity: 1 }));
    const p = predictRunOut(3, history, "2026-10-26")!;
    // 10 units over 19 days ≈ 0.526/day → 3 / 0.526 ≈ 5 days
    expect(p.daysLeft).toBe(5);
    expect(p.confidence).toBe("high");
  });
});

describe("CSV", () => {
  it("neutralises spreadsheet formulas (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+91 98")).toBe("'+91 98");
    expect(csvCell(-5)).toBe("-5");
  });
  it("quotes commas and newlines and starts with a BOM", () => {
    const csv = toCsv(["a", "b"], [["x,y", "line1\nline2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x,y","line1\nline2"');
  });
  it("import accepts ISO and day-first dates", () => {
    expect(normaliseDate("2026-10-26")).toBe("2026-10-26");
    expect(normaliseDate("26/10/2026")).toBe("2026-10-26");
    expect(normaliseDate("5-1-2027")).toBe("2027-01-05");
    expect(normaliseDate("31/02/2026")).toBe("invalid");
    expect(normaliseDate("")).toBeNull();
  });
});

describe("recipe suggestions", () => {
  it("prefers recipes that use expiring items and never uses expired ones", () => {
    const out = suggestRecipes([
      { id: "1", name: "Bananas", status: "EXPIRING", daysLeft: 1 },
      { id: "2", name: "Toned Milk", status: "SAFE", daysLeft: 10 },
      { id: "3", name: "Paneer", status: "EXPIRED", daysLeft: -2 },
    ]);
    expect(out[0].recipe.id).toBe("banana-smoothie");
    expect(out.flatMap((s) => s.matched.map((m) => m.itemName))).not.toContain("Paneer");
  });
});

import { describe, expect, it } from "vitest";
import { parseDatePhrase, parseQuickAdd } from "../quickAdd";

// Friday 30 Oct 2026
const today = "2026-10-30";

describe("quick add parser", () => {
  it.each([
    ["2 kg potatoes expiring friday", { name: "Potatoes", quantity: 2, unit: "kg", expiryDate: "2026-11-06" }],
    ["add half litre milk use by tomorrow", { name: "Milk", quantity: 0.5, unit: "l", expiryDate: "2026-10-31" }],
    ["6 eggs best before 10 november", { name: "Eggs", quantity: 6, unit: "pcs", expiryDate: "2026-11-10" }],
    ["500g paneer expires 5/11", { name: "Paneer", quantity: 500, unit: "g", expiryDate: "2026-11-05" }],
    ["a dozen bananas expiring in 4 days", { name: "Bananas", quantity: 12 / 12, unit: "dozen", expiryDate: "2026-11-03" }],
    ["two packets of bread expiry 2026-11-02", { name: "Bread", quantity: 2, unit: "pack", expiryDate: "2026-11-02" }],
    ["Basmati rice 5 kg", { name: "Basmati Rice", quantity: 5, unit: "kg", expiryDate: null }],
    ["salt", { name: "Salt", quantity: null, unit: null, expiryDate: null }],
  ])("%s", (text, expected) => {
    expect(parseQuickAdd(text, today)).toEqual(expected);
  });

  it("understands date phrases and rejects impossible dates", () => {
    expect(parseDatePhrase("next week", today)).toBe("2026-11-06");
    expect(parseDatePhrase("in 2 weeks", today)).toBe("2026-11-13");
    expect(parseDatePhrase("1 jan", today)).toBe("2027-01-01"); // already past this year → next year
    expect(parseDatePhrase("31/02/2027", today)).toBeNull();
    expect(parseDatePhrase("someday", today)).toBeNull();
  });
});

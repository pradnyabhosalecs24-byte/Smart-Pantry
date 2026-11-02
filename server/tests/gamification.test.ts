import { describe, expect, it } from "vitest";
import { challengeFor, levelFor, streaks } from "../src/services/gamification.js";
import { createItem, day, newUser } from "./helpers.js";

describe("gamification rules", () => {
  it("levels and progress", () => {
    expect(levelFor(0)).toMatchObject({ number: 1, name: "Pantry Newbie", progress: 0 });
    expect(levelFor(150)).toMatchObject({ number: 2, name: "Kitchen Helper", progress: 25 });
    expect(levelFor(99999)).toMatchObject({ number: 7, name: "Pantry Legend", next: null, progress: 100 });
  });

  it("streaks: current run ends today or yesterday; best is the longest ever", () => {
    const d = new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-28", "2026-10-29"]);
    expect(streaks(d, "2026-10-30")).toEqual({ current: 2, best: 3 });
    expect(streaks(d, "2026-10-31")).toEqual({ current: 0, best: 3 });
  });

  it("challenges rotate weekly and are the same within a week", () => {
    expect(challengeFor("2026-10-26").key).not.toBe(challengeFor("2026-11-02").key);
    expect(challengeFor("2026-10-26").key).toBe(challengeFor("2026-10-26").key);
  });
});

describe("gamification API", () => {
  it("new account starts at zero; real actions earn points and badges", async () => {
    const u = await newUser();
    let g = (await u.get("/api/gamification")).body;
    expect(g.xp).toBe(0);
    expect(g.badges.every((b: { earned: boolean }) => !b.earned)).toBe(true);

    const milk = await createItem(u, { name: "Milk", unit: "l", quantity: 2, expiryDate: day(2) }); // expiring soon
    await u.post(`/api/items/${milk.id}/consume`, { quantity: 0.5 });
    g = (await u.get("/api/gamification")).body;
    // +5 added, +10 used, +15 rescued (used while expiring soon)
    expect(g.breakdown).toMatchObject({ adds: 5, uses: 10, rescues: 15 });
    expect(g.streaks.kitchen).toBe(1);
    expect(g.newBadges).toEqual(expect.arrayContaining(["first-item", "first-use", "rescuer"]));

    // celebrated once
    await u.post("/api/gamification/seen", { keys: g.newBadges });
    expect((await u.get("/api/gamification")).body.newBadges).toEqual([]);
  });

  it("demo data never earns points", async () => {
    const u = await newUser();
    await u.post("/api/demo");
    const g = (await u.get("/api/gamification")).body;
    expect(g.xp).toBe(0);
    expect(g.stats.uses).toBe(0);
  });

  it("caps repeated actions per day so points can't be farmed", async () => {
    const u = await newUser();
    for (let i = 0; i < 14; i++) await createItem(u, { name: `Farm ${i}` });
    const g = (await u.get("/api/gamification")).body;
    expect(g.breakdown.adds).toBe(50); // 10 per day × 5 points
  });

  it("cooking a recipe counts as a cook", async () => {
    const u = await newUser();
    const potatoes = await createItem(u, { name: "Potatoes", unit: "kg", quantity: 1, expiryDate: day(30) });
    await u.post("/api/recipes/cooked", { recipeName: "Jeera Aloo", uses: [{ itemId: potatoes.id, quantity: 300, unit: "g" }] });
    const g = (await u.get("/api/gamification")).body;
    expect(g.breakdown.cooks).toBe(25);
    expect(g.badges.find((b: { key: string }) => b.key === "home-chef").earned).toBe(true);
  });
});

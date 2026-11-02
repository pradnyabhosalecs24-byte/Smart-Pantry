import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { inferAction, inferMinutes, recipeAmountIn, recipesWithIngredient, RECIPES } from "../src/lib/recipes.js";
import { splitInstructions, youtubeIdFrom } from "../src/services/onlineRecipes.js";
import { createItem, day, ids, newUser } from "./helpers.js";

describe("recipe library", () => {
  it("every recipe is complete and its step ingredients exist", () => {
    for (const r of RECIPES) {
      expect(r.steps.length, r.id).toBeGreaterThan(1);
      expect(r.ingredients.length, r.id).toBeGreaterThan(1);
      const names = new Set(r.ingredients.map((x) => x.name));
      for (const s of r.steps) for (const u of s.uses ?? []) expect(names.has(u), `${r.id}: ${u}`).toBe(true);
    }
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it("finds many dishes for potato, by English, plural or Hindi name", () => {
    const names = recipesWithIngredient("potato").map((r) => r.name);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toEqual(expect.arrayContaining(["Aloo Paratha", "Jeera Aloo", "Batata Vada", "Creamy Mashed Potatoes"]));
    // dishes named after the ingredient come first
    const named = ["Aloo Paratha", "Jeera Aloo", "Aloo Gobi", "Aloo Tikki", "Batata Vada", "Dum Aloo", "Creamy Mashed Potatoes"];
    for (const n of named) expect(names.indexOf(n), n).toBeLessThan(names.indexOf("Vegetable Sandwich"));
    expect(recipesWithIngredient("Potatoes").length).toBe(names.length);
    expect(recipesWithIngredient("aloo").length).toBeGreaterThanOrEqual(10);
    expect(recipesWithIngredient("zz")).toEqual([]);
  });

  it("converts recipe amounts into pantry units only when comparable", () => {
    expect(recipeAmountIn(250, "g", "kg")).toBe(0.25);
    expect(recipeAmountIn(2, "tbsp", "ml")).toBe(30);
    expect(recipeAmountIn(1, "tsp", "kg")).toBeNull();
  });

  it("splits and reads online instructions", () => {
    expect(splitInstructions("STEP 1\r\nBoil the potatoes for 15 minutes.\r\nSTEP 2\r\nMash them.")).toEqual(["Boil the potatoes for 15 minutes.", "Mash them."]);
    expect(splitInstructions("Chop it. Fry it. Serve it.").length).toBe(2);
    expect(inferAction("Fry the onions until golden")).toBe("fry");
    expect(inferAction("Preheat the oven to 200C")).toBe("bake");
    expect(inferMinutes("simmer for 20-25 minutes")).toBe(25);
    expect(youtubeIdFrom("https://www.youtube.com/watch?v=abcdefghijk")).toBe("abcdefghijk");
  });
});

describe("recipe API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    config.onlineRecipesEnabled = false;
  });

  it("explores by ingredient and reports online search as disabled honestly", async () => {
    const u = await newUser();
    const res = await u.get("/api/recipes/explore?ingredient=potato");
    expect(res.status).toBe(200);
    expect(res.body.library.length).toBeGreaterThanOrEqual(10);
    expect(res.body.onlineStatus).toBe("disabled");
    expect((await u.get("/api/recipes/explore?ingredient=a")).status).toBe(400);
  });

  it("scales quantities by servings and checks them against the pantry", async () => {
    const u = await newUser();
    const t = await ids(u);
    await createItem(u, { name: "Potatoes", unit: "kg", quantity: 1, expiryDate: day(20), categoryId: t.other });
    const base = (await u.get("/api/recipes/library/jeera-aloo")).body;
    expect(base.servings).toBe(2);
    const four = (await u.get("/api/recipes/library/jeera-aloo?servings=4")).body;
    const potato = four.ingredients.find((x: { name: string }) => x.name === "Potatoes");
    expect(potato.qty).toBe(600); // 300 g for 2 → 600 g for 4
    expect(potato.pantry).toMatchObject({ itemName: "Potatoes", needed: 0.6, enough: true });
    expect(four.recipe.steps[0].uses[0]).toMatchObject({ name: "Potatoes", qty: 600, unit: "g" });
    expect((await u.get("/api/recipes/library/does-not-exist")).status).toBe(404);
  });

  it("'I cooked this' takes ingredients out of the pantry and reports items that ran short", async () => {
    const u = await newUser();
    const potatoes = await createItem(u, { name: "Potatoes", unit: "kg", quantity: 1, expiryDate: day(20) });
    const salt = await createItem(u, { name: "Salt", unit: "g", quantity: 5, noExpiry: true, expiryDate: "" });
    const res = await u.post("/api/recipes/cooked", {
      recipeName: "Jeera Aloo",
      uses: [
        { itemId: potatoes.id, quantity: 300, unit: "g" },
        { itemId: salt.id, quantity: 50 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toHaveLength(1);
    expect(res.body.failed[0].itemId).toBe(salt.id);
    expect((await u.get(`/api/items/${potatoes.id}`)).body.item.quantity).toBe(0.7);
    const history = (await u.get("/api/usage?type=CONSUMED")).body.events;
    expect(history[0].note).toBe("Cooked: Jeera Aloo");
    // another user's item can't be used
    const other = await newUser();
    const theirs = await other.post("/api/recipes/cooked", { recipeName: "x", uses: [{ itemId: potatoes.id, quantity: 1 }] });
    expect(theirs.status).toBe(400);
    expect(theirs.body.failed[0].message).toContain("not found");
  });

  it("reads online recipes (TheMealDB) with video and pantry check, and survives an outage", async () => {
    config.onlineRecipesEnabled = true;
    const meal = {
      idMeal: "52999", strMeal: "Potato Salad", strCategory: "Side", strArea: "British", strMealThumb: "https://example.com/p.jpg",
      strYoutube: "https://www.youtube.com/watch?v=AbCdEfGhIjK", strSource: "", strInstructions: "Boil the potatoes for 15 minutes.\r\nMix with mayonnaise.",
      strIngredient1: "Potatoes", strMeasure1: "500g", strIngredient2: "Mayonnaise", strMeasure2: "3 tbsp", strIngredient3: "", strMeasure3: "",
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("filter.php") ? { meals: url.includes("potatoes") ? [{ idMeal: "52999", strMeal: "Potato Salad", strMealThumb: "x" }] : null } : { meals: [meal] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const u = await newUser();
    await createItem(u, { name: "Potatoes", unit: "kg", quantity: 1, expiryDate: day(20) });
    const explore = (await u.get("/api/recipes/explore?ingredient=potato")).body;
    expect(explore.onlineStatus).toBe("ok");
    expect(explore.online[0]).toMatchObject({ id: "52999", name: "Potato Salad" });
    const detail = (await u.get("/api/recipes/online/52999")).body;
    expect(detail.recipe).toMatchObject({ youtubeId: "AbCdEfGhIjK", cuisine: "British" });
    expect(detail.recipe.steps[0]).toMatchObject({ action: "boil", minutes: 15 });
    expect(detail.ingredients[0].pantry.itemName).toBe("Potatoes");
    expect(detail.ingredients[1].pantry).toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const down = (await u.get("/api/recipes/explore?ingredient=spinach")).body;
    expect(down.onlineStatus).toBe("unavailable");
    expect(down.library.length).toBeGreaterThan(0); // the built-in library still works
  });
});

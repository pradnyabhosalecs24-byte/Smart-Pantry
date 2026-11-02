import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, handler, notFound, param, parse } from "../lib/http.js";
import { bestPantryMatch, findRecipe, nameMatches, recipeAmountIn, recipesWithIngredient, RECIPES, suggestRecipes, type Recipe } from "../lib/recipes.js";
import { roundQty } from "../lib/units.js";
import * as v from "../lib/validators.js";
import { uid } from "../middleware/auth.js";
import { getOnlineRecipe, searchOnline } from "../services/onlineRecipes.js";
import { getCtx, loadItemViews, type ItemView } from "../services/pantry.js";
import { deductStock } from "../services/stock.js";

export const recipesRouter = Router();

const POPULAR = ["Potato", "Tomato", "Onion", "Rice", "Egg", "Paneer", "Milk", "Bread", "Banana", "Curd", "Spinach", "Carrot", "Chicken", "Pasta"];

const summary = (r: Recipe) => ({
  id: r.id,
  source: "library" as const,
  name: r.name,
  cuisine: r.cuisine,
  course: r.course,
  diet: r.diet,
  minutes: r.minutes,
  servings: r.servings,
  ingredientCount: r.ingredients.filter((x) => !x.optional).length,
  stepCount: r.steps.length,
  // The most characteristic step (not washing/boiling/serving), used as the card animation
  signature: (r.steps.find((st) => !["wash", "chop", "boil", "soak", "rest", "serve", "mix"].includes(st.action)) ?? r.steps[0]).action,
});

const inStock = (items: ItemView[]) => items.filter((i) => i.quantity > 0);

/** "Use it up": recipes ranked by how many soon-to-expire items they use. */
recipesRouter.get(
  "/suggestions",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = inStock(await loadItemViews(ctx));
    res.json({
      suggestions: suggestRecipes(items.map((i) => ({ id: i.id, name: i.name, status: i.status, daysLeft: i.daysLeft }))),
      expiringCount: items.filter((i) => i.status === "EXPIRING").length,
      note: "Suggestions only use items within their date. Always check food before cooking.",
    });
  }),
);

/** Ingredient chips: what's in the pantry now (most urgent first) plus common ingredients. */
recipesRouter.get(
  "/ingredients",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = inStock(await loadItemViews(ctx)).filter((i) => i.status !== "EXPIRED");
    items.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    res.json({
      pantry: items.slice(0, 16).map((i) => ({ name: i.name, status: i.status, daysLeft: i.daysLeft })),
      popular: POPULAR,
      libraryCount: RECIPES.length,
    });
  }),
);

/** Every dish that can be made with an ingredient: built-in library first, then online results. */
recipesRouter.get(
  "/explore",
  handler(async (req, res) => {
    const { ingredient } = parse(z.object({ ingredient: z.string().trim().min(2, "Type at least 2 letters").max(50) }), req.query);
    const local = recipesWithIngredient(ingredient).map(summary);
    const online = await searchOnline(ingredient);
    res.json({ ingredient, library: local, online: online.results, onlineStatus: online.status });
  }),
);

/** How each recipe ingredient compares with the pantry, with amounts scaled to the chosen servings. */
function pantryCheck(recipe: Recipe, servings: number, items: ItemView[]) {
  const factor = servings / recipe.servings;
  return recipe.ingredients.map((ing) => {
    const qty = ing.qty == null ? null : roundQty(ing.qty * factor);
    const item = bestPantryMatch(items, ing.keywords);
    const needed = item && qty != null ? recipeAmountIn(qty, ing.unit, item.unit) : null;
    return {
      name: ing.name,
      qty,
      unit: ing.unit,
      optional: Boolean(ing.optional),
      pantry: item
        ? {
            itemId: item.id,
            itemName: item.name,
            available: item.quantity,
            unit: item.unit,
            status: item.status,
            daysLeft: item.daysLeft,
            // amount in the pantry item's unit, when the units are comparable
            needed,
            enough: needed == null ? null : item.quantity >= needed,
          }
        : null,
    };
  });
}

recipesRouter.get(
  "/library/:id",
  handler(async (req, res) => {
    const recipe = findRecipe(param(req, "id"));
    if (!recipe) throw notFound("Recipe");
    const { servings } = parse(z.object({ servings: z.coerce.number().int().min(1).max(20).optional() }), req.query);
    const ctx = await getCtx(uid(req));
    const items = inStock(await loadItemViews(ctx));
    const n = servings ?? recipe.servings;
    const factor = n / recipe.servings;
    res.json({
      recipe: {
        ...summary(recipe),
        video: recipe.video,
        steps: recipe.steps.map((s) => ({
          ...s,
          uses: (s.uses ?? []).map((name) => {
            const ing = recipe.ingredients.find((x) => x.name === name);
            return { name, qty: ing?.qty == null ? null : roundQty(ing.qty * factor), unit: ing?.unit ?? "" };
          }),
        })),
      },
      servings: n,
      ingredients: pantryCheck(recipe, n, items),
    });
  }),
);

recipesRouter.get(
  "/online/:id",
  handler(async (req, res) => {
    const recipe = await getOnlineRecipe(param(req, "id"));
    const ctx = await getCtx(uid(req));
    const items = inStock(await loadItemViews(ctx));
    res.json({
      recipe,
      // Online measures are free text ("2 cups"), so we only show whether the pantry has the item
      ingredients: recipe.ingredients.map((ing) => {
        const word = ing.name.toLowerCase().replace(/(oes|es|s)$/, (m) => (m === "oes" ? "o" : ""));
        const item = items.find((i) => i.status !== "EXPIRED" && (nameMatches(i.name, [word]) || nameMatches(ing.name, [i.name.toLowerCase()])));
        return { ...ing, pantry: item ? { itemId: item.id, itemName: item.name, available: item.quantity, unit: item.unit, status: item.status } : null };
      }),
    });
  }),
);

/** "I cooked this": records use of each pantry item the user confirmed, taking stock First-Expiry-First-Out. */
recipesRouter.post(
  "/cooked",
  handler(async (req, res) => {
    const body = parse(
      z.object({
        recipeName: v.trimmed(120, "Recipe name"),
        uses: z.array(z.object({ itemId: z.string().uuid(), quantity: v.quantity(), unit: v.unit.optional() })).min(1, "Choose at least one ingredient").max(30),
      }),
      req.body,
    );
    if (new Set(body.uses.map((u) => u.itemId)).size !== body.uses.length) throw badRequest("Each pantry item can only be listed once");
    const ctx = await getCtx(uid(req));
    const recorded: { itemId: string; name: string; quantity: number; unit: string }[] = [];
    const failed: { itemId: string; message: string }[] = [];
    // Each item is its own transaction: one item running short doesn't undo the others
    for (const u of body.uses) {
      try {
        const r = await deductStock(ctx, u.itemId, { type: "CONSUMED", quantity: u.quantity, unit: u.unit, note: `Cooked: ${body.recipeName}` });
        recorded.push({ itemId: u.itemId, name: r.item.name, quantity: u.quantity, unit: u.unit ?? r.item.unit });
      } catch (err) {
        failed.push({ itemId: u.itemId, message: (err as Error).message });
      }
    }
    if (recorded.length) await logActivity(prisma, ctx.userId, "RECIPE_COOKED", "recipe", `Cooked ${body.recipeName}`);
    res.status(failed.length && !recorded.length ? 400 : 200).json({ recorded, failed });
  }),
);

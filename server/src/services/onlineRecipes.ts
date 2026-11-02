import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { inferAction, inferMinutes, type CookAction } from "../lib/recipes.js";

// TheMealDB (https://www.themealdb.com) — free public recipe database with photos and YouTube links.
// "1" is its public test key. Results are cached in memory so repeat searches are instant
// and the free service isn't called more than needed.

const BASE = "https://www.themealdb.com/api/json/v1/1";
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function fetchJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const r = await fetch(`${BASE}/${path}`, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "SmartPantryManager/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const value = (await r.json()) as T;
  cache.set(path, { at: Date.now(), value });
  return value;
}

export interface OnlineSummary {
  id: string;
  source: "themealdb";
  name: string;
  image: string;
}

export type OnlineStatus = "ok" | "none" | "unavailable" | "disabled";

/** Meals that use an ingredient. Tries "potato", "potatoes", "Potatoes" because the database spells some in plural. */
export async function searchOnline(ingredient: string): Promise<{ status: OnlineStatus; results: OnlineSummary[] }> {
  if (!config.onlineRecipesEnabled) return { status: "disabled", results: [] };
  const base = ingredient.trim().toLowerCase();
  const variants = [...new Set([base, base.endsWith("o") ? `${base}es` : `${base}s`, base.replace(/s$/, "")])].filter(Boolean);
  try {
    const seen = new Map<string, OnlineSummary>();
    for (const v of variants) {
      const data = await fetchJson<{ meals: { idMeal: string; strMeal: string; strMealThumb: string }[] | null }>(`filter.php?i=${encodeURIComponent(v.replace(/ /g, "_"))}`);
      for (const m of data.meals ?? []) seen.set(m.idMeal, { id: m.idMeal, source: "themealdb", name: m.strMeal, image: m.strMealThumb });
      if (seen.size >= 30) break;
    }
    const results = [...seen.values()].slice(0, 30);
    return { status: results.length ? "ok" : "none", results };
  } catch (err) {
    console.warn("[recipes] online lookup failed:", (err as Error).message);
    return { status: "unavailable", results: [] };
  }
}

export interface OnlineRecipe {
  id: string;
  source: "themealdb";
  name: string;
  category: string | null;
  cuisine: string | null;
  image: string | null;
  youtubeId: string | null;
  sourceUrl: string | null;
  ingredients: { name: string; measure: string }[];
  steps: { text: string; action: CookAction; minutes?: number }[];
}

export function youtubeIdFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** Turns one block of instructions into clean, numbered-free steps. */
export function splitInstructions(text: string): string[] {
  const lines = text
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, "").trim())
    .filter((l) => l.length > 3 && !/^step\s*\d+$/i.test(l));
  // One long paragraph: split it into pairs of sentences so each step stays readable
  if (lines.length <= 1) {
    const sentences = (lines[0] ?? text).match(/[^.!?]+[.!?]+/g) ?? [text];
    const out: string[] = [];
    for (let k = 0; k < sentences.length; k += 2) out.push(sentences.slice(k, k + 2).join(" ").trim());
    return out.filter(Boolean);
  }
  return lines;
}

export async function getOnlineRecipe(id: string): Promise<OnlineRecipe> {
  if (!config.onlineRecipesEnabled) throw new HttpError(503, "Online recipes are turned off on this server", "DISABLED");
  if (!/^\d{1,10}$/.test(id)) throw new HttpError(400, "Invalid recipe id");
  let data: { meals: Record<string, string | null>[] | null };
  try {
    data = await fetchJson(`lookup.php?i=${id}`);
  } catch {
    throw new HttpError(502, "The online recipe service couldn't be reached. Try a recipe from the built-in library.", "LOOKUP_UNAVAILABLE");
  }
  const m = data.meals?.[0];
  if (!m) throw new HttpError(404, "Recipe not found", "NOT_FOUND");
  const ingredients: OnlineRecipe["ingredients"] = [];
  for (let n = 1; n <= 20; n++) {
    const name = m[`strIngredient${n}`]?.trim();
    if (name) ingredients.push({ name, measure: m[`strMeasure${n}`]?.trim() ?? "" });
  }
  return {
    id,
    source: "themealdb",
    name: m.strMeal ?? "Recipe",
    category: m.strCategory ?? null,
    cuisine: m.strArea ?? null,
    image: m.strMealThumb ?? null,
    youtubeId: youtubeIdFrom(m.strYoutube),
    sourceUrl: m.strSource || null,
    ingredients,
    steps: splitInstructions(m.strInstructions ?? "").map((text) => ({ text, action: inferAction(text), minutes: inferMinutes(text) })),
  };
}

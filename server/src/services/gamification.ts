import { prisma } from "../db.js";
import { addDays, dateStrToDate, diffDays, todayInTz } from "../lib/dates.js";
import { DEFAULT_CATEGORIES, DEFAULT_LOCATIONS } from "../lib/defaults.js";
import type { Ctx } from "./pantry.js";

// Points, levels, streaks, badges and weekly challenges — all calculated from what the user really did.
// Demo data never counts, and daily caps stop "farming" points by adding and deleting items.

export const POINTS = {
  use: 10, // recorded using food
  rescue: 15, // bonus: used food while it was expiring soon
  cook: 25, // finished a recipe with "I cooked this"
  add: 5, // added or restocked an item
  purchase: 5, // bought something from the shopping list
  honestWaste: 2, // recorded waste instead of hiding it
} as const;

const DAILY_CAP = { use: 20, add: 10, purchase: 10, cook: 5, waste: 10 };

export const LEVELS = [
  { name: "Pantry Newbie", min: 0 },
  { name: "Kitchen Helper", min: 100 },
  { name: "Smart Shopper", min: 300 },
  { name: "Waste Warrior", min: 600 },
  { name: "Pantry Pro", min: 1000 },
  { name: "Zero-Waste Hero", min: 1600 },
  { name: "Pantry Legend", min: 2500 },
];

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] ?? null;
  return {
    number: i + 1,
    name: LEVELS[i].name,
    min: LEVELS[i].min,
    next: next ? { number: i + 2, name: next.name, min: next.min } : null,
    progress: next ? Math.round(((xp - LEVELS[i].min) / (next.min - LEVELS[i].min)) * 100) : 100,
  };
}

/** Longest run of consecutive dates, and the run that is still alive (ending today or yesterday). */
export function streaks(dates: Set<string>, today: string) {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  let cursor = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best };
}

/** Monday of the week containing the date. */
export function weekStart(date: string): string {
  const dow = dateStrToDate(date).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

type Metric = "rescued" | "uses" | "cooks" | "wasteFreeDays" | "purchases";
const CHALLENGES: { key: string; title: string; description: string; metric: Metric; target: number; reward: number }[] = [
  { key: "rescue-3", title: "Rescue mission", description: "Use 3 items while they're expiring soon", metric: "rescued", target: 3, reward: 60 },
  { key: "use-10", title: "Busy kitchen", description: "Record using food 10 times", metric: "uses", target: 10, reward: 50 },
  { key: "cook-2", title: "Chef's week", description: "Cook 2 recipes and tap “I cooked this”", metric: "cooks", target: 2, reward: 60 },
  { key: "waste-free-5", title: "Clean plate", description: "Have 5 days this week with no food wasted", metric: "wasteFreeDays", target: 5, reward: 50 },
  { key: "shop-3", title: "Planned shopping", description: "Buy 3 things from your shopping list", metric: "purchases", target: 3, reward: 40 },
];

/** Challenges rotate every Monday; every user gets the same one in a given week. */
export function challengeFor(monday: string) {
  const weekNo = Math.floor(dateStrToDate(monday).getTime() / (7 * 86_400_000));
  return CHALLENGES[((weekNo % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
}

interface BadgeDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: "bronze" | "silver" | "gold";
  value: (s: Stats) => number;
  target: number;
}

interface Stats {
  uses: number;
  rescued: number;
  cooks: number;
  added: number;
  purchases: number;
  wasted: number;
  bestStreak: number;
  wasteFreeDays: number;
  customPlaces: number;
  barcodes: number;
}

export const BADGES: BadgeDef[] = [
  { key: "first-item", title: "First item", description: "Add your first item to the pantry", icon: "package-plus", tier: "bronze", value: (s) => s.added, target: 1 },
  { key: "first-use", title: "First use", description: "Record using some food", icon: "utensils", tier: "bronze", value: (s) => s.uses, target: 1 },
  { key: "rescuer", title: "Food rescuer", description: "Use an item while it's expiring soon", icon: "life-buoy", tier: "bronze", value: (s) => s.rescued, target: 1 },
  { key: "home-chef", title: "Home chef", description: "Cook a recipe and record it", icon: "chef-hat", tier: "bronze", value: (s) => s.cooks, target: 1 },
  { key: "honest", title: "Honest logger", description: "Record food that was wasted, so you can learn from it", icon: "notebook-pen", tier: "bronze", value: (s) => s.wasted, target: 1 },
  { key: "organiser", title: "Organiser", description: "Create your own category or storage place", icon: "folder-tree", tier: "bronze", value: (s) => s.customPlaces, target: 1 },
  { key: "on-a-roll", title: "On a roll", description: "Use food 3 days in a row", icon: "flame", tier: "silver", value: (s) => s.bestStreak, target: 3 },
  { key: "stocked-up", title: "Stocked up", description: "Add or restock 25 items", icon: "warehouse", tier: "silver", value: (s) => s.added, target: 25 },
  { key: "smart-shopper", title: "Smart shopper", description: "Buy 10 things from your shopping list", icon: "shopping-cart", tier: "silver", value: (s) => s.purchases, target: 10 },
  { key: "barcode-pro", title: "Barcode pro", description: "Save 5 items with a barcode", icon: "scan-barcode", tier: "silver", value: (s) => s.barcodes, target: 5 },
  { key: "week-warrior", title: "Week warrior", description: "Use food 7 days in a row", icon: "calendar-check", tier: "gold", value: (s) => s.bestStreak, target: 7 },
  { key: "rescue-squad", title: "Rescue squad", description: "Rescue 20 items before they expire", icon: "shield-check", tier: "gold", value: (s) => s.rescued, target: 20 },
  { key: "master-chef", title: "Master chef", description: "Cook 10 recipes", icon: "award", tier: "gold", value: (s) => s.cooks, target: 10 },
  { key: "zero-waste-week", title: "Zero-waste week", description: "Go 7 days without wasting food (with at least 5 uses)", icon: "leaf", tier: "gold", value: (s) => (s.uses >= 5 ? s.wasteFreeDays : 0), target: 7 },
];

/** Adds points per day with a cap, so bursts of the same action don't inflate the score. */
function capped(dates: string[], perEvent: number, cap: number) {
  const perDay = new Map<string, number>();
  for (const d of dates) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  let total = 0;
  for (const n of perDay.values()) total += Math.min(n, cap) * perEvent;
  return total;
}

export async function computeGamification(ctx: Ctx) {
  const { userId, timezone, today } = ctx;
  const local = (d: Date) => todayInTz(timezone, d);

  const [user, usage, activity, customCats, customLocs, barcodes, stored] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
    prisma.usageEvent.findMany({ where: { userId, isDemo: false }, select: { type: true, rescued: true, occurredAt: true } }),
    prisma.activity.findMany({
      where: { userId, action: { in: ["ITEM_CREATED", "RESTOCKED", "SHOPPING_PURCHASED", "RECIPE_COOKED"] } },
      select: { action: true, createdAt: true },
    }),
    prisma.category.count({ where: { userId, name: { notIn: DEFAULT_CATEGORIES.map((c) => c.name) } } }),
    prisma.location.count({ where: { userId, name: { notIn: DEFAULT_LOCATIONS } } }),
    prisma.item.count({ where: { userId, isDemo: false, barcode: { not: null } } }),
    prisma.achievement.findMany({ where: { userId } }),
  ]);

  const uses = usage.filter((u) => u.type === "CONSUMED");
  const wastes = usage.filter((u) => u.type === "WASTED");
  const rescues = uses.filter((u) => u.rescued);
  const adds = activity.filter((a) => a.action === "ITEM_CREATED" || a.action === "RESTOCKED");
  const purchases = activity.filter((a) => a.action === "SHOPPING_PURCHASED");
  const cooks = activity.filter((a) => a.action === "RECIPE_COOKED");

  const useDays = new Set(uses.map((u) => local(u.occurredAt)));
  const wasteDays = new Set(wastes.map((w) => local(w.occurredAt)));
  const startDay = local(user.createdAt);
  const lastWaste = [...wasteDays].sort().at(-1);
  const kitchen = streaks(useDays, today);
  // Days since the last waste (or since joining), counting today
  const wasteFreeDays = lastWaste === today ? 0 : diffDays(lastWaste ?? addDays(startDay, -1), today);

  // Weekly challenges: completed past weeks add their reward; the current week shows progress
  const metricIn = (metric: Metric, from: string, to: string) => {
    const inRange = (d: Date) => {
      const x = local(d);
      return x >= from && x <= to;
    };
    switch (metric) {
      case "rescued":
        return rescues.filter((u) => inRange(u.occurredAt)).length;
      case "uses":
        return uses.filter((u) => inRange(u.occurredAt)).length;
      case "cooks":
        return cooks.filter((a) => inRange(a.createdAt)).length;
      case "purchases":
        return purchases.filter((a) => inRange(a.createdAt)).length;
      case "wasteFreeDays": {
        let n = 0;
        for (let d = from < startDay ? startDay : from; d <= to; d = addDays(d, 1)) if (!wasteDays.has(d)) n++;
        return n;
      }
    }
  };
  let challengeXp = 0;
  const thisMonday = weekStart(today);
  for (let w = weekStart(startDay); w < thisMonday; w = addDays(w, 7)) {
    const c = challengeFor(w);
    if (metricIn(c.metric, w, addDays(w, 6)) >= c.target) challengeXp += c.reward;
  }
  const current = challengeFor(thisMonday);
  const currentProgress = metricIn(current.metric, thisMonday, today);
  const currentDone = currentProgress >= current.target;
  if (currentDone) challengeXp += current.reward;

  const breakdown = {
    uses: capped(uses.map((u) => local(u.occurredAt)), POINTS.use, DAILY_CAP.use),
    rescues: capped(rescues.map((u) => local(u.occurredAt)), POINTS.rescue, DAILY_CAP.use),
    cooks: capped(cooks.map((a) => local(a.createdAt)), POINTS.cook, DAILY_CAP.cook),
    adds: capped(adds.map((a) => local(a.createdAt)), POINTS.add, DAILY_CAP.add),
    purchases: capped(purchases.map((a) => local(a.createdAt)), POINTS.purchase, DAILY_CAP.purchase),
    honesty: capped(wastes.map((w) => local(w.occurredAt)), POINTS.honestWaste, DAILY_CAP.waste),
    challenges: challengeXp,
  };
  const xp = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const stats: Stats = {
    uses: uses.length,
    rescued: rescues.length,
    cooks: cooks.length,
    added: adds.length,
    purchases: purchases.length,
    wasted: wastes.length,
    bestStreak: kitchen.best,
    wasteFreeDays,
    customPlaces: customCats + customLocs,
    barcodes,
  };

  // Once earned, a badge stays earned. Newly earned badges are stored so they're celebrated exactly once.
  const storedByKey = new Map(stored.map((a) => [a.key, a]));
  const newlyEarned = BADGES.filter((b) => !storedByKey.has(b.key) && b.value(stats) >= b.target).map((b) => b.key);
  if (newlyEarned.length) {
    await prisma.achievement.createMany({ data: newlyEarned.map((key) => ({ userId, key })), skipDuplicates: true });
    for (const a of await prisma.achievement.findMany({ where: { userId, key: { in: newlyEarned } } })) storedByKey.set(a.key, a);
  }

  const badges = BADGES.map((b) => {
    const a = storedByKey.get(b.key);
    return {
      key: b.key,
      title: b.title,
      description: b.description,
      icon: b.icon,
      tier: b.tier,
      earned: Boolean(a),
      earnedAt: a?.earnedAt ?? null,
      seen: Boolean(a?.seenAt),
      progress: { current: Math.min(b.value(stats), b.target), target: b.target },
    };
  });

  return {
    xp,
    level: levelFor(xp),
    breakdown,
    points: POINTS,
    streaks: { kitchen: kitchen.current, bestKitchen: kitchen.best, wasteFree: wasteFreeDays, usedToday: useDays.has(today) },
    stats,
    challenge: {
      ...current,
      progress: Math.min(currentProgress, current.target),
      completed: currentDone,
      endsOn: addDays(thisMonday, 6),
    },
    badges,
    newBadges: badges.filter((b) => b.earned && !b.seen).map((b) => b.key),
  };
}

export type Gamification = Awaited<ReturnType<typeof computeGamification>>;

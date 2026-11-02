import { lockKey, prisma, Prisma } from "../db.js";
import { conflict } from "../lib/http.js";
import { logActivity } from "../lib/activity.js";
import { addDays, dateStrToDate } from "../lib/dates.js";
import { DEFAULT_CATEGORIES } from "../lib/defaults.js";
import { getCtx } from "./pantry.js";

// Realistic sample data for demonstrations. Every record is flagged isDemo so it is
// shown with a "Demo" badge and can be removed in one click without touching real data.

const DEMO_NOTE = "Sample entry (demo data)";

interface DemoItem {
  name: string;
  brand?: string;
  category: string;
  location: string;
  unit: string;
  minStock: number;
  noExpiry?: boolean;
  batches: { qty: number; initial?: number; exp: number | null; bought: number; opened?: number; cost?: number }[];
}

// exp / bought / opened are day offsets from today
const ITEMS: DemoItem[] = [
  { name: "Toned Milk", brand: "Nandini", category: "Dairy", location: "Refrigerator", unit: "l", minStock: 1, batches: [{ qty: 0.5, initial: 1, exp: 1, bought: -2, opened: -1, cost: 54 }, { qty: 1, exp: 5, bought: 0, cost: 54 }] },
  { name: "Curd", category: "Dairy", location: "Refrigerator", unit: "g", minStock: 200, batches: [{ qty: 400, exp: 3, bought: -2, cost: 45 }] },
  { name: "Paneer", category: "Dairy", location: "Refrigerator", unit: "g", minStock: 0, batches: [{ qty: 200, exp: -1, bought: -6, cost: 90 }] },
  { name: "Tomatoes", category: "Fruits & Vegetables", location: "Refrigerator", unit: "kg", minStock: 0.5, batches: [{ qty: 1.2, exp: 4, bought: -1, cost: 48 }] },
  { name: "Onions", category: "Fruits & Vegetables", location: "Pantry Shelf", unit: "kg", minStock: 1, batches: [{ qty: 2.5, exp: 20, bought: -3, cost: 75 }] },
  { name: "Bananas", category: "Fruits & Vegetables", location: "Pantry Shelf", unit: "pcs", minStock: 4, batches: [{ qty: 5, exp: 2, bought: -2, cost: 40 }] },
  { name: "Spinach", category: "Fruits & Vegetables", location: "Refrigerator", unit: "g", minStock: 0, batches: [{ qty: 250, exp: 0, bought: -3, cost: 30 }] },
  { name: "Apples", category: "Fruits & Vegetables", location: "Refrigerator", unit: "pcs", minStock: 2, batches: [{ qty: 4, exp: 9, bought: -2, cost: 120 }] },
  { name: "Basmati Rice", brand: "India Gate", category: "Grains & Cereals", location: "Pantry Shelf", unit: "kg", minStock: 2, batches: [{ qty: 4, initial: 5, exp: 240, bought: -20, cost: 650 }] },
  { name: "Toor Dal", category: "Grains & Cereals", location: "Kitchen Cabinet", unit: "kg", minStock: 1, batches: [{ qty: 0.8, initial: 1, exp: 150, bought: -25, cost: 160 }] },
  { name: "Whole Wheat Bread", brand: "Modern", category: "Bakery", location: "Kitchen Cabinet", unit: "pack", minStock: 1, batches: [{ qty: 1, exp: 2, bought: -1, cost: 50 }] },
  { name: "Eggs", category: "Other", location: "Refrigerator", unit: "pcs", minStock: 6, batches: [{ qty: 10, initial: 12, exp: 9, bought: -3, cost: 84 }] },
  { name: "Frozen Green Peas", brand: "Safal", category: "Frozen Foods", location: "Freezer", unit: "g", minStock: 250, batches: [{ qty: 500, exp: 120, bought: -10, cost: 95 }] },
  { name: "Rock Salt", category: "Spices & Condiments", location: "Kitchen Cabinet", unit: "kg", minStock: 0.25, noExpiry: true, batches: [{ qty: 1, exp: null, bought: -40, cost: 30 }] },
  { name: "Turmeric Powder", brand: "Everest", category: "Spices & Condiments", location: "Kitchen Cabinet", unit: "g", minStock: 50, batches: [{ qty: 100, exp: 200, bought: -30, cost: 38 }] },
  { name: "Orange Juice", brand: "Real", category: "Beverages", location: "Refrigerator", unit: "l", minStock: 0, batches: [{ qty: 0.6, initial: 1, exp: 30, bought: -4, opened: -2, cost: 125 }] },
  { name: "Baked Beans", brand: "Heinz", category: "Canned Foods", location: "Pantry Shelf", unit: "can", minStock: 2, batches: [{ qty: 1, initial: 2, exp: 300, bought: -15, cost: 198 }] },
  { name: "Potato Chips", category: "Snacks", location: "Kitchen Cabinet", unit: "pack", minStock: 0, batches: [{ qty: 3, exp: 45, bought: -5, cost: 60 }] },
  { name: "Cheese Slices", brand: "Amul", category: "Dairy", location: "Refrigerator", unit: "pack", minStock: 1, batches: [{ qty: 0, initial: 1, exp: 10, bought: -12, cost: 140 }] },
];

// Small deterministic random generator so the demo looks the same every time
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function loadDemo(userId: string) {
  const ctx = await getCtx(userId);
  const today = ctx.today;
  const at = (offset: number) => dateStrToDate(addDays(today, offset));
  // Noon IST-ish timestamp for history records
  const when = (offset: number) => new Date(`${addDays(today, offset)}T07:00:00.000Z`);

  return prisma.$transaction(
    async (tx) => {
      await lockKey(tx, `demo:${userId}`);
      if (await tx.item.findFirst({ where: { userId, isDemo: true }, select: { id: true } })) throw conflict("Demo data is already loaded", "DEMO_LOADED");
      // Make sure the categories/locations the demo needs exist (the user may have renamed defaults)
      const catIds = new Map((await tx.category.findMany({ where: { userId } })).map((c) => [c.name.toLowerCase(), c.id]));
      const locIds = new Map((await tx.location.findMany({ where: { userId } })).map((l) => [l.name.toLowerCase(), l.id]));
      for (const it of ITEMS) {
        if (!catIds.has(it.category.toLowerCase())) {
          const def = DEFAULT_CATEGORIES.find((c) => c.name === it.category);
          catIds.set(it.category.toLowerCase(), (await tx.category.create({ data: { userId, name: it.category, openedShelfLifeDays: def?.openedShelfLifeDays ?? null } })).id);
        }
        if (!locIds.has(it.location.toLowerCase())) locIds.set(it.location.toLowerCase(), (await tx.location.create({ data: { userId, name: it.location } })).id);
      }

      const ids = new Map<string, { id: string; unit: string; category: string; costPerUnit: number }>();
      for (const it of ITEMS) {
        // Avoid clashing with a real item of the same name
        const clash = await tx.item.findFirst({ where: { userId, deletedAt: null, unit: it.unit, name: { equals: it.name, mode: "insensitive" } } });
        const name = clash ? `${it.name} (demo)` : it.name;
        const created = await tx.item.create({
          data: {
            userId,
            name,
            brand: it.brand ?? null,
            unit: it.unit,
            minStock: it.minStock,
            noExpiry: Boolean(it.noExpiry),
            categoryId: catIds.get(it.category.toLowerCase())!,
            locationId: locIds.get(it.location.toLowerCase())!,
            isDemo: true,
            notes: "Demo data",
            batches: {
              create: it.batches.map((b) => ({
                quantity: b.qty,
                initialQuantity: b.initial ?? b.qty,
                expiryDate: b.exp == null ? null : at(b.exp),
                purchaseDate: at(b.bought),
                openedAt: b.opened == null ? null : at(b.opened),
                cost: b.cost ?? null,
              })),
            },
          },
        });
        const b0 = it.batches[0];
        ids.set(it.name, { id: created.id, unit: it.unit, category: it.category, costPerUnit: b0.cost ? b0.cost / (b0.initial ?? b0.qty) : 0 });
      }

      // ~90 days of history: steady consumption, and waste that falls month by month
      const rand = rng(42);
      const usage: Prisma.UsageEventCreateManyInput[] = [];
      const consumePlan: [string, number, number][] = [
        ["Toned Milk", 0.5, 1],
        ["Basmati Rice", 0.25, 2],
        ["Eggs", 2, 2],
        ["Whole Wheat Bread", 1, 3],
        ["Toor Dal", 0.15, 3],
        ["Onions", 0.25, 2],
        ["Tomatoes", 0.2, 2],
        ["Curd", 200, 3],
        ["Bananas", 2, 3],
      ];
      for (const [name, qty, every] of consumePlan) {
        const info = ids.get(name)!;
        for (let d = -88; d <= -1; d += every + Math.floor(rand() * 2)) {
          usage.push({
            userId, itemId: info.id, itemName: name, categoryName: info.category, type: "CONSUMED",
            quantity: qty, unit: info.unit, estimatedCost: Math.round(info.costPerUnit * qty * 100) / 100, isDemo: true, occurredAt: when(d),
          });
        }
      }
      const wastePlan: [string, number, "EXPIRED" | "SPOILED" | "LEFTOVER" | "OVERBOUGHT", number][] = [
        ["Spinach", 250, "SPOILED", -84], ["Toned Milk", 0.5, "EXPIRED", -80], ["Bananas", 3, "SPOILED", -76], ["Whole Wheat Bread", 1, "EXPIRED", -72],
        ["Tomatoes", 0.5, "SPOILED", -66], ["Curd", 200, "EXPIRED", -63], ["Paneer", 200, "EXPIRED", -60], ["Spinach", 250, "SPOILED", -55],
        ["Basmati Rice", 0.5, "LEFTOVER", -50], ["Whole Wheat Bread", 1, "EXPIRED", -44], ["Bananas", 2, "OVERBOUGHT", -38],
        ["Spinach", 125, "SPOILED", -26], ["Toned Milk", 0.5, "EXPIRED", -18], ["Tomatoes", 0.3, "SPOILED", -9],
      ];
      for (const [name, qty, reason, d] of wastePlan) {
        const info = ids.get(name)!;
        usage.push({
          userId, itemId: info.id, itemName: name, categoryName: info.category, type: "WASTED", quantity: qty, unit: info.unit, reason,
          estimatedCost: Math.round(info.costPerUnit * qty * 100) / 100, isDemo: true, occurredAt: when(d),
        });
      }
      await tx.usageEvent.createMany({ data: usage });

      await tx.shoppingItem.createMany({
        data: [
          { userId, name: "Coriander", quantity: 1, unit: "pack", note: DEMO_NOTE },
          { userId, name: "Butter", quantity: 500, unit: "g", note: DEMO_NOTE },
        ],
        skipDuplicates: true,
      });
      await logActivity(tx, userId, "DEMO_LOADED", "demo", `Loaded demo data (${ITEMS.length} items, ${usage.length} history records)`);
      return { items: ITEMS.length, history: usage.length };
    },
    { timeout: 60_000 },
  );
}

export async function clearDemo(userId: string) {
  return prisma.$transaction(async (tx) => {
    const demoItems = await tx.item.findMany({ where: { userId, isDemo: true }, select: { id: true } });
    const ids = demoItems.map((i) => i.id);
    await tx.notification.deleteMany({ where: { userId, itemId: { in: ids } } });
    const usage = await tx.usageEvent.deleteMany({ where: { userId, isDemo: true } });
    await tx.shoppingItem.deleteMany({ where: { userId, OR: [{ note: DEMO_NOTE }, { itemId: { in: ids } }] } });
    const items = await tx.item.deleteMany({ where: { userId, isDemo: true } });
    await logActivity(tx, userId, "DEMO_CLEARED", "demo", `Removed demo data (${items.count} items, ${usage.count} history records)`);
    return { items: items.count, history: usage.count };
  });
}

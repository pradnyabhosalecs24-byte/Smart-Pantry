import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, createItem, day, ids, newUser } from "./helpers.js";

const CSRF = { "X-Requested-With": "SmartPantry" };

describe("auth & security", () => {
  it("health check reports the database", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("connected");
  });

  it("validates registration fields", async () => {
    const res = await request(app).post("/api/auth/register").set(CSRF).send({ name: "", email: "bad", password: "short" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });

  it("rejects duplicate emails and wrong passwords with safe messages", async () => {
    const u = await newUser("dup");
    const again = await request(app).post("/api/auth/register").set(CSRF).send({ name: "x", email: u.email, password: "pantry123" });
    expect(again.status).toBe(409);
    const wrong = await request(app).post("/api/auth/login").set(CSRF).send({ email: u.email, password: "wrongpass1" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe("Invalid email or password");
    const ok = await request(app).post("/api/auth/login").set(CSRF).send({ email: u.email.toUpperCase(), password: "pantry123" });
    expect(ok.status).toBe(200);
  });

  it("stores the session in an httpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/register").set(CSRF).send({ name: "c", email: `c-${Date.now()}@example.com`, password: "pantry123" });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("sp_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("protects routes and blocks requests without the CSRF header", async () => {
    expect((await request(app).get("/api/items")).status).toBe(401);
    const u = await newUser("csrf");
    const res = await u.agent.post("/api/items").send({ name: "x" }); // no X-Requested-With
    expect(res.status).toBe(403);
  });

  it("password reset: dev link works once and signs out old sessions", async () => {
    const u = await newUser("reset");
    const forgot = await request(app).post("/api/auth/forgot-password").set(CSRF).send({ email: u.email });
    expect(forgot.body.emailConfigured).toBe(false); // honest: no SMTP in tests
    const token = new URL(forgot.body.devResetUrl).searchParams.get("token");
    const reset = await request(app).post("/api/auth/reset-password").set(CSRF).send({ token, password: "newpass456" });
    expect(reset.status).toBe(200);
    expect((await u.get("/api/auth/me")).status).toBe(401); // old cookie no longer valid
    const reuse = await request(app).post("/api/auth/reset-password").set(CSRF).send({ token, password: "another789" });
    expect(reuse.status).toBe(400);
    const login = await request(app).post("/api/auth/login").set(CSRF).send({ email: u.email, password: "newpass456" });
    expect(login.status).toBe(200);
  });
});

describe("pantry items", () => {
  it("creates an item and gives new accounts default categories and locations", async () => {
    const u = await newUser();
    const t = await ids(u);
    const res = await u.post("/api/items", { name: "Milk", categoryId: t.dairy, locationId: t.fridge, unit: "l", quantity: 1.5, expiryDate: day(3), purchaseDate: day(0), cost: 90 });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ name: "Milk", quantity: 1.5, status: "EXPIRING", daysLeft: 3, lowStock: false });
  });

  it("validates required fields, quantities and dates", async () => {
    const u = await newUser();
    const t = await ids(u);
    const base = { name: "Rice", categoryId: t.grains, locationId: t.shelf, unit: "kg", quantity: 1, expiryDate: day(100) };
    const cases: [object, string][] = [
      [{ ...base, name: "" }, "name"],
      [{ ...base, quantity: -1 }, "quantity"],
      [{ ...base, quantity: 0 }, "quantity"],
      [{ ...base, quantity: "abc" }, "quantity"],
      [{ ...base, unit: "bucket" }, "unit"],
      [{ ...base, expiryDate: "2026-02-30" }, "expiryDate"],
      [{ ...base, expiryDate: undefined }, "expiryDate"],
      [{ ...base, purchaseDate: day(2) }, "purchaseDate"],
      [{ ...base, purchaseDate: day(-1), expiryDate: day(-5) }, "expiryDate"],
    ];
    for (const [body, field] of cases) {
      const res = await u.post("/api/items", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.details.fields).toHaveProperty(field);
    }
  });

  it("allows items with no expiry only when explicitly marked", async () => {
    const u = await newUser();
    const item = await createItem(u, { name: "Salt", noExpiry: true, expiryDate: "" });
    expect(item.status).toBe("NO_EXPIRY");
  });

  it("detects duplicates and can merge them as a new batch", async () => {
    const u = await newUser();
    await createItem(u, { name: "Sugar", quantity: 1 });
    const dup = await createItem(u, { name: "sugar", quantity: 1 }).catch((e) => e);
    expect(String(dup)).toContain("409");
    const t = await ids(u);
    const merged = await u.post("/api/items", { name: "SUGAR", categoryId: t.other, locationId: t.shelf, unit: "kg", quantity: 2, expiryDate: day(60), duplicateStrategy: "merge" });
    expect(merged.status).toBe(200);
    expect(merged.body.item.quantity).toBe(3);
    expect(merged.body.item.batches).toHaveLength(2);
  });

  it("searches, filters, sorts and paginates", async () => {
    const u = await newUser();
    await createItem(u, { name: "Apple Juice", expiryDate: day(2) });
    await createItem(u, { name: "Banana", expiryDate: day(-1) });
    await createItem(u, { name: "Cashews", expiryDate: day(90), brand: "Nutty" });
    const search = await u.get("/api/items?search=nutty");
    expect(search.body.items.map((i: { name: string }) => i.name)).toEqual(["Cashews"]);
    const expired = await u.get("/api/items?status=EXPIRED");
    expect(expired.body.total).toBe(1);
    const byName = await u.get("/api/items?sort=name&order=desc");
    expect(byName.body.items[0].name).toBe("Cashews");
    const urgent = await u.get("/api/items");
    expect(urgent.body.items[0].name).toBe("Banana"); // default sort: most urgent first
    const page2 = await u.get("/api/items?sort=name&pageSize=2&page=2");
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.totalPages).toBe(2);
  });

  it("respects the configurable warning period", async () => {
    const u = await newUser();
    const item = await createItem(u, { expiryDate: day(10) });
    expect(item.status).toBe("SAFE");
    const s = (await u.get("/api/settings")).body.settings;
    await u.put("/api/settings", { ...s, warningDays: 14 });
    expect((await u.get(`/api/items/${item.id}`)).body.item.status).toBe("EXPIRING");
  });

  it("rejects stale edits (optimistic concurrency)", async () => {
    const u = await newUser();
    const item = await createItem(u, { barcode: "8901234567890", brand: "Acme", openedShelfLifeDays: 5 });
    const first = await u.patch(`/api/items/${item.id}`, { version: item.version, notes: "first" });
    expect(first.status).toBe(200);
    // A partial edit must leave untouched fields alone
    expect(first.body.item).toMatchObject({ notes: "first", barcode: "8901234567890", brand: "Acme", openedShelfLifeDays: 5 });
    const stale = await u.patch(`/api/items/${item.id}`, { version: item.version, notes: "second" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("soft-deletes to trash, restores, and permanently deletes", async () => {
    const u = await newUser();
    const item = await createItem(u);
    expect((await u.del(`/api/items/${item.id}`)).status).toBe(200);
    expect((await u.get(`/api/items/${item.id}`)).status).toBe(404);
    expect((await u.get("/api/items/trash")).body.items).toHaveLength(1);
    expect((await u.post(`/api/items/${item.id}/restore`)).status).toBe(200);
    await u.del(`/api/items/${item.id}`);
    expect((await u.del(`/api/items/${item.id}/permanent`)).status).toBe(200);
    expect((await u.get("/api/items/trash")).body.items).toHaveLength(0);
  });
});

describe("stock: FEFO, consumption, waste", () => {
  it("consumes from the batch that expires first", async () => {
    const u = await newUser();
    const item = await createItem(u, { quantity: 1, expiryDate: day(10) });
    await u.post(`/api/items/${item.id}/batches`, { quantity: 1, expiryDate: day(3) });
    const res = await u.post(`/api/items/${item.id}/consume`, { quantity: 1.5 });
    expect(res.status).toBe(200);
    const batches = res.body.item.batches.map((b: { expiryDate: string; quantity: number }) => [b.expiryDate, b.quantity]);
    expect(batches).toEqual([[day(3), 0], [day(10), 0.5]]);
    expect(res.body.item.quantity).toBe(0.5);
  });

  it("never lets stock go negative", async () => {
    const u = await newUser();
    const item = await createItem(u, { quantity: 1 });
    const res = await u.post(`/api/items/${item.id}/consume`, { quantity: 1.001 });
    expect(res.status).toBe(400);
    expect((await u.get(`/api/items/${item.id}`)).body.item.quantity).toBe(1);
  });

  it("converts compatible units and rejects incompatible ones", async () => {
    const u = await newUser();
    const item = await createItem(u, { quantity: 1, unit: "kg" });
    const ok = await u.post(`/api/items/${item.id}/consume`, { quantity: 250, unit: "g" });
    expect(ok.body.item.quantity).toBe(0.75);
    const bad = await u.post(`/api/items/${item.id}/consume`, { quantity: 1, unit: "pcs" });
    expect(bad.status).toBe(400);
  });

  it("asks before recording expired food as eaten; discarding records waste and cost", async () => {
    const u = await newUser();
    const item = await createItem(u, { quantity: 2, expiryDate: day(-2), purchaseDate: day(-10), cost: 100 });
    const eat = await u.post(`/api/items/${item.id}/consume`, { quantity: 1 });
    expect(eat.status).toBe(409);
    expect(eat.body.error.code).toBe("EXPIRED_STOCK");
    const confirmed = await u.post(`/api/items/${item.id}/consume`, { quantity: 1, allowExpired: true });
    expect(confirmed.status).toBe(200);
    const waste = await u.post(`/api/items/${item.id}/discard`, { quantity: 1, reason: "EXPIRED" });
    expect(waste.status).toBe(200);
    expect(waste.body.item.status).toBe("OUT_OF_STOCK");
    const history = await u.get("/api/usage?type=WASTED");
    expect(history.body.events[0]).toMatchObject({ quantity: 1, reason: "EXPIRED", estimatedCost: 50 });
  });

  it("marks an item opened and shortens its effective expiry", async () => {
    const u = await newUser();
    const t = await ids(u);
    const res = await u.post("/api/items", { name: "Yogurt", categoryId: t.dairy, locationId: t.fridge, unit: "g", quantity: 400, expiryDate: day(30) });
    const batch = res.body.item.batches[0];
    const opened = await u.post(`/api/items/${res.body.item.id}/batches/${batch.id}/open`, {});
    // Dairy default: 4 days after opening
    expect(opened.body.item.batches[0]).toMatchObject({ effectiveExpiry: day(4), expiryReason: "OPENED", status: "EXPIRING" });
  });

  it("flags low stock separately from expiry", async () => {
    const u = await newUser();
    const item = await createItem(u, { quantity: 1, minStock: 2, expiryDate: day(200) });
    expect(item).toMatchObject({ status: "SAFE", lowStock: true });
  });
});

describe("data isolation between users", () => {
  it("one user can never read, change or delete another user's data", async () => {
    const alice = await newUser("alice");
    const bob = await newUser("bob");
    const item = await createItem(alice, { name: "Alice's Ghee" });

    expect((await bob.get(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/items/${item.id}`, { version: item.version, name: "hacked" })).status).toBe(404);
    expect((await bob.post(`/api/items/${item.id}/consume`, { quantity: 1 })).status).toBe(404);
    expect((await bob.post(`/api/items/${item.id}/batches`, { quantity: 1, expiryDate: day(5) })).status).toBe(404);
    expect((await bob.del(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.get("/api/items")).body.total).toBe(0);
    expect((await bob.get(`/api/items/${item.id}/history`)).status).toBe(404);

    // Bob can't file items under Alice's category either
    const aliceCats = await ids(alice);
    const bobCats = await ids(bob);
    const sneaky = await bob.post("/api/items", { name: "x", categoryId: aliceCats.dairy, locationId: bobCats.shelf, unit: "kg", quantity: 1, expiryDate: day(5) });
    expect(sneaky.status).toBe(400);
    expect((await bob.del(`/api/categories/${aliceCats.dairy}`)).status).toBe(404);

    expect((await alice.get(`/api/items/${item.id}`)).body.item.name).toBe("Alice's Ghee");
  });
});

describe("categories & locations", () => {
  it("won't delete a category in use unless items are reassigned", async () => {
    const u = await newUser();
    const t = await ids(u);
    await createItem(u, { categoryId: t.dairy });
    const blocked = await u.del(`/api/categories/${t.dairy}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.itemCount).toBe(1);
    const moved = await u.del(`/api/categories/${t.dairy}?reassignTo=${t.other}`);
    expect(moved.body.moved).toBe(1);
    expect((await u.get("/api/items")).body.items[0].category.id).toBe(t.other);
  });

  it("prevents duplicate names (case-insensitive)", async () => {
    const u = await newUser();
    expect((await u.post("/api/locations", { name: "Garage" })).status).toBe(201);
    expect((await u.post("/api/locations", { name: "garage" })).status).toBe(409);
  });
});

describe("shopping list", () => {
  it("adds low-stock items, prevents duplicates and restocks the pantry on purchase", async () => {
    const u = await newUser();
    const item = await createItem(u, { name: "Atta", quantity: 1, minStock: 2 });
    const added = await u.post("/api/shopping/from-low-stock");
    expect(added.body.added).toBe(1);
    expect((await u.post("/api/shopping/from-low-stock")).body.added).toBe(0); // no duplicates

    const list = (await u.get("/api/shopping")).body.pending;
    expect(list[0]).toMatchObject({ name: "Atta", itemId: item.id });
    const dup = await u.post("/api/shopping", { name: "atta", quantity: 1, unit: "kg" });
    expect(dup.status).toBe(409);

    const missingExpiry = await u.post(`/api/shopping/${list[0].id}/purchase`, { addToPantry: true, quantity: 5 });
    expect(missingExpiry.status).toBe(400);
    const bought = await u.post(`/api/shopping/${list[0].id}/purchase`, { addToPantry: true, quantity: 5, expiryDate: day(120) });
    expect(bought.status).toBe(200);
    expect(bought.body.item.quantity).toBe(6);
    expect(bought.body.item.lowStock).toBe(false);
    expect((await u.get("/api/shopping")).body.purchased).toHaveLength(1);
  });
});

describe("dashboard, notifications, analytics", () => {
  it("dashboard counts come from real data and update after changes", async () => {
    const u = await newUser();
    await createItem(u, { expiryDate: day(-1) });
    const soon = await createItem(u, { expiryDate: day(2) });
    await createItem(u, { expiryDate: day(60), quantity: 1, minStock: 5 });
    let d = (await u.get("/api/dashboard")).body;
    expect(d.counts).toMatchObject({ total: 3, expired: 1, expiring: 1, safe: 1, lowStock: 1 });
    await u.post(`/api/items/${soon.id}/discard`, { quantity: 2, reason: "SPOILED" });
    d = (await u.get("/api/dashboard")).body;
    expect(d.counts).toMatchObject({ expiring: 0, outOfStock: 1 });
    expect(d.waste30.events).toBe(1);
  });

  it("notifications are generated once (no duplicates) and can be marked read", async () => {
    const u = await newUser();
    await createItem(u, { expiryDate: day(1) });
    const first = await u.get("/api/notifications");
    const second = await u.get("/api/notifications");
    expect(first.body.unread).toBe(1);
    expect(second.body.notifications).toHaveLength(1);
    await u.post("/api/notifications/read-all");
    expect((await u.get("/api/notifications/unread-count")).body.unread).toBe(0);
  });

  it("analytics handles an empty account and validates ranges", async () => {
    const u = await newUser();
    const a = await u.get("/api/analytics");
    expect(a.status).toBe(200);
    expect(a.body.summary.wastedEvents).toBe(0);
    expect((await u.get(`/api/analytics?from=${day(0)}&to=${day(-5)}`)).status).toBe(400);
  });

  it("demo data loads, shows insights, and clears without touching real data", async () => {
    const u = await newUser();
    const real = await createItem(u, { name: "My Real Item" });
    expect((await u.post("/api/demo")).status).toBe(201);
    expect((await u.post("/api/demo")).status).toBe(409);
    expect((await u.get("/api/predictions")).body.predictions.length).toBeGreaterThan(3);
    expect((await u.get("/api/recipes/suggestions")).body.suggestions.length).toBeGreaterThan(0);
    await u.del("/api/demo");
    const items = (await u.get("/api/items")).body.items;
    expect(items.map((i: { id: string }) => i.id)).toEqual([real.id]);
  });
});

describe("import / export / backup", () => {
  const csv = [
    "Name,Category,Location,Quantity,Unit,Expiry Date,Purchase Date,Min Stock,Brand,Cost,No Expiry,Notes",
    "Ragi Flour,Grains & Cereals,Pantry Shelf,1,kg,30/12/2026,,0.5,,85,,",
    "Ghee,Dairy,Spice Rack,0.5,l,2027-03-01,,0,,300,,",
    "Bad Row,Dairy,Refrigerator,-2,kg,2026-12-01,,0,,,,",
    "No Date,Other,Pantry Shelf,1,kg,,,0,,,,",
    "Ragi Flour,Grains & Cereals,Pantry Shelf,1,kg,30/12/2026,,0.5,,85,,",
  ].join("\n");

  it("previews errors and duplicates, then imports valid rows", async () => {
    const u = await newUser();
    const preview = await u.post("/api/data/import/items", { csv, dryRun: true });
    expect(preview.body.validRows).toBe(2);
    expect(preview.body.errors.map((e: { row: number }) => e.row)).toEqual([4, 5]);
    expect(preview.body.duplicates).toHaveLength(1);
    expect(preview.body.newLocations).toEqual(["Spice Rack"]);
    expect((await u.get("/api/items")).body.total).toBe(0); // dry run changes nothing

    const commit = await u.post("/api/data/import/items", { csv, dryRun: false });
    expect(commit.body.created).toBe(2);
    const again = await u.post("/api/data/import/items", { csv, dryRun: true });
    expect(again.body.validRows).toBe(0); // already imported
  });

  it("exports CSV safely and round-trips a backup into another account", async () => {
    const u = await newUser();
    await createItem(u, { name: "=cmd|' /C calc'!A0", quantity: 1 });
    const out = await u.get("/api/data/export/items.csv");
    expect(out.headers["content-type"]).toContain("text/csv");
    expect(out.text).toContain("'=cmd");

    const backup = (await u.get("/api/data/backup.json")).body;
    const other = await newUser();
    const dry = await other.post("/api/data/restore", { backup, dryRun: true });
    expect(dry.body.summary.items.add).toBe(1);
    expect((await other.get("/api/items")).body.total).toBe(0);
    await other.post("/api/data/restore", { backup, dryRun: false });
    expect((await other.get("/api/items")).body.total).toBe(1);
    const twice = await other.post("/api/data/restore", { backup, dryRun: true });
    expect(twice.body.summary.items.skipExisting).toBe(1); // never duplicates or overwrites
  });

  it("rejects a file that isn't a valid backup", async () => {
    const u = await newUser();
    const res = await u.post("/api/data/restore", { backup: { hello: "world" }, dryRun: true });
    expect(res.status).toBe(400);
  });

  it("produces a PDF report", async () => {
    const u = await newUser();
    await createItem(u);
    const res = await u.get("/api/data/export/report.pdf").buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("images", () => {
  it("accepts real images only and keeps them private", async () => {
    const u = await newUser();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7a6a5b70000000049454e44ae426082", "hex");
    const up = await u.agent.post("/api/images").set(CSRF).attach("image", png, { filename: "x.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    const fake = await u.agent.post("/api/images").set(CSRF).attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.png", contentType: "image/png" });
    expect(fake.status).toBe(400);
    const other = await newUser();
    expect((await other.get(`/api/images/${up.body.imageId}`)).status).toBe(404);
    expect((await u.get(`/api/images/${up.body.imageId}`)).headers["content-type"]).toBe("image/png");
  });
});

describe("loophole fixes (double-clicks, exposure, clean-up)", () => {
  it("a double-clicked 'Add to pantry' on a shopping entry adds it only once", async () => {
    const u = await newUser();
    const t = await ids(u);
    const entry = (await u.post("/api/shopping", { name: "Ghee", quantity: 1, unit: "l" })).body.entry;
    const body = { addToPantry: true, quantity: 1, expiryDate: day(60), categoryId: t.other, locationId: t.shelf };
    const res = await Promise.all([u.post(`/api/shopping/${entry.id}/purchase`, body), u.post(`/api/shopping/${entry.id}/purchase`, body)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await u.get("/api/items?search=Ghee")).body.total).toBe(1);
  });

  it("a double-clicked 'Add to pantry' on a new item creates it only once", async () => {
    const u = await newUser();
    const t = await ids(u);
    const body = { name: "Sugar", categoryId: t.other, locationId: t.shelf, unit: "kg", quantity: 1, expiryDate: day(90) };
    const res = await Promise.all([u.post("/api/items", body), u.post("/api/items", body)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await u.get("/api/items?search=Sugar")).body.total).toBe(1);
  });

  it("a double-clicked 'Load demo data' loads it only once", async () => {
    const u = await newUser();
    const res = await Promise.all([u.post("/api/demo"), u.post("/api/demo")]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await u.get("/api/items?pageSize=100")).body.total).toBe(19);
  });

  it("two simultaneous sign-ups with one email give a clear message", async () => {
    const email = `same-${Date.now()}@example.com`;
    const send = () => request(app).post("/api/auth/register").set(CSRF).send({ name: "x", email, password: "pantry123" });
    const res = await Promise.all([send(), send()]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(res.find((r) => r.status === 409)!.body.error.message).toMatch(/account with this email already exists/i);
  });

  it("reset links are never shown on screen unless explicitly enabled for development", async () => {
    const { config } = await import("../src/config.js");
    const u = await newUser();
    config.devShowResetLink = false;
    try {
      const res = await request(app).post("/api/auth/forgot-password").set(CSRF).send({ email: u.email });
      expect(res.body.devResetUrl).toBeUndefined();
      expect(res.body.message).toMatch(/not configured/);
    } finally {
      config.devShowResetLink = true;
    }
  });

  it("clean-up removes photos never attached to an item, but keeps attached ones", async () => {
    const { cleanupStaleData } = await import("../src/services/notifications.js");
    const u = await newUser();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7a6a5b70000000049454e44ae426082", "hex");
    const upload = () => u.agent.post("/api/images").set(CSRF).attach("image", png, { filename: "x.png", contentType: "image/png" });
    const orphan = (await upload()).body.imageId;
    const kept = (await upload()).body.imageId;
    await createItem(u, { imageId: kept });
    await cleanupStaleData(new Date(Date.now() + 2 * 86_400_000)); // pretend two days have passed
    expect((await u.get(`/api/images/${orphan}`)).status).toBe(404);
    expect((await u.get(`/api/images/${kept}`)).status).toBe(200);
  });

  it("sign out of all devices invalidates every session", async () => {
    const u = await newUser();
    const other = request.agent(app);
    await other.post("/api/auth/login").set(CSRF).send({ email: u.email, password: "pantry123" });
    expect((await other.get("/api/auth/me")).status).toBe(200);
    expect((await u.post("/api/auth/logout-all")).status).toBe(200);
    expect((await other.get("/api/auth/me")).status).toBe(401);
    expect((await u.get("/api/auth/me")).status).toBe(401);
  });

  it("deleting an account needs the password and removes all of its data", async () => {
    const u = await newUser();
    const item = await createItem(u);
    expect((await u.agent.delete("/api/auth/me").set(CSRF).send({ password: "wrong", confirm: "DELETE" })).status).toBe(400);
    expect((await u.agent.delete("/api/auth/me").set(CSRF).send({ password: "pantry123", confirm: "nope" })).status).toBe(400);
    expect((await u.agent.delete("/api/auth/me").set(CSRF).send({ password: "pantry123", confirm: "DELETE" })).status).toBe(200);
    const { prisma } = await import("../src/db.js");
    expect(await prisma.item.count({ where: { id: item.id } })).toBe(0);
    const login = await request(app).post("/api/auth/login").set(CSRF).send({ email: u.email, password: "pantry123" });
    expect(login.status).toBe(401);
  });
});

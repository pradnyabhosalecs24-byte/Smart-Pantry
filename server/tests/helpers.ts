import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { addDays, todayInTz } from "../src/lib/dates.js";

export const app = createApp();
const CSRF = { "X-Requested-With": "SmartPantry" };

/** A signed-in test user. Wraps supertest so every call carries the cookie and CSRF header. */
export async function newUser(label = "user") {
  const agent = request.agent(app);
  const email = `${label}-${randomUUID()}@example.com`;
  const res = await agent.post("/api/auth/register").set(CSRF).send({ name: label, email, password: "pantry123" });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const api = {
    email,
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set(CSRF).send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set(CSRF).send(body ?? {}),
    put: (url: string, body?: object) => agent.put(url).set(CSRF).send(body ?? {}),
    del: (url: string) => agent.delete(url).set(CSRF),
  };
  return api;
}

export type TestUser = Awaited<ReturnType<typeof newUser>>;

// The app defaults to Asia/Kolkata, so tests compute "today" the same way
export const today = () => todayInTz("Asia/Kolkata");
export const day = (offset: number) => addDays(today(), offset);

export async function ids(u: TestUser) {
  const cats = (await u.get("/api/categories")).body.categories as { id: string; name: string }[];
  const locs = (await u.get("/api/locations")).body.locations as { id: string; name: string }[];
  return {
    dairy: cats.find((c) => c.name === "Dairy")!.id,
    grains: cats.find((c) => c.name === "Grains & Cereals")!.id,
    other: cats.find((c) => c.name === "Other")!.id,
    fridge: locs.find((l) => l.name === "Refrigerator")!.id,
    shelf: locs.find((l) => l.name === "Pantry Shelf")!.id,
  };
}

export async function createItem(u: TestUser, overrides: Record<string, unknown> = {}) {
  const t = await ids(u);
  const res = await u.post("/api/items", {
    name: `Item ${randomUUID().slice(0, 6)}`,
    categoryId: t.other,
    locationId: t.shelf,
    unit: "kg",
    quantity: 2,
    expiryDate: day(30),
    purchaseDate: day(-1),
    ...overrides,
  });
  if (res.status !== 201 && res.status !== 200) throw new Error(`createItem failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.item;
}

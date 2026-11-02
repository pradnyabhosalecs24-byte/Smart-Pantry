import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { runDailyReminders } from "../src/services/notifications.js";
import { createItem, day, newUser, type TestUser } from "./helpers.js";

type N = { id: string; type: string; title: string; message: string; readAt: string | null; emailStatus: string };
const list = async (u: TestUser) => (await u.get("/api/notifications")).body as { notifications: N[]; unread: number };
const setSettings = async (u: TestUser, patch: Record<string, unknown>) => {
  const s = (await u.get("/api/settings")).body.settings;
  const r = await u.put("/api/settings", {
    warningDays: s.warningDays, timezone: s.timezone, currency: s.currency,
    notifyExpiring: s.notifyExpiring, notifyLowStock: s.notifyLowStock, notifyRunOut: s.notifyRunOut, emailReminders: s.emailReminders,
    ...patch,
  });
  expect(r.status).toBe(200);
};

describe("notifications: every alert type", () => {
  it("creates EXPIRED, EXPIRING and LOW_STOCK alerts, and nothing for safe stock", async () => {
    const u = await newUser("n");
    await createItem(u, { name: "Old Paneer", expiryDate: day(-2), purchaseDate: day(-9) });
    await createItem(u, { name: "Milk", expiryDate: day(1) });
    await createItem(u, { name: "Rice", expiryDate: day(200), quantity: 1, minStock: 5 });
    await createItem(u, { name: "Salt", expiryDate: day(300) });
    const { notifications, unread } = await list(u);
    const byType = Object.fromEntries(notifications.map((n) => [n.type, n.title]));
    expect(byType).toEqual({ EXPIRED: "Old Paneer has expired", EXPIRING: "Milk expires soon", LOW_STOCK: expect.stringContaining("Rice") });
    expect(unread).toBe(3);
    expect(notifications.some((n) => n.title.includes("Salt"))).toBe(false);
  });

  it("forecasts RUNNING_OUT from real usage", async () => {
    const u = await newUser("n");
    const item = await createItem(u, { name: "Atta", quantity: 10, expiryDate: day(300), minStock: 0 });
    // steady use over the past two weeks → run-out date in the near future
    for (let i = 14; i >= 1; i -= 2) {
      const r = await u.post(`/api/items/${item.id}/consume`, { quantity: 1, date: day(-i) });
      expect(r.status).toBeLessThan(300);
    }
    const types = (await list(u)).notifications.map((n) => n.type);
    expect(types).toContain("RUNNING_OUT");
  });

  it("never repeats an alert, but a new batch with a new date alerts again", async () => {
    const u = await newUser("n");
    const item = await createItem(u, { name: "Curd", expiryDate: day(1) });
    await list(u); await list(u); await list(u);
    expect((await list(u)).notifications).toHaveLength(1);
    await u.post(`/api/items/${item.id}/batches`, { quantity: 1, expiryDate: day(2), purchaseDate: day(0) });
    expect((await list(u)).notifications.filter((n) => n.type === "EXPIRING").length).toBe(2);
  });
});

describe("notifications: settings switches", () => {
  it("each switch turns its alerts off", async () => {
    const u = await newUser("n");
    await setSettings(u, { notifyExpiring: false, notifyLowStock: false });
    await createItem(u, { expiryDate: day(-1) });
    await createItem(u, { expiryDate: day(1) });
    await createItem(u, { expiryDate: day(200), quantity: 1, minStock: 5 });
    expect((await list(u)).notifications).toHaveLength(0);
    await setSettings(u, { notifyLowStock: true });
    expect((await list(u)).notifications.map((n) => n.type)).toEqual(["LOW_STOCK"]);
  });

  it("warning period decides what counts as 'expiring soon'", async () => {
    const u = await newUser("n");
    await setSettings(u, { warningDays: 1 });
    await createItem(u, { expiryDate: day(5) });
    expect((await list(u)).notifications).toHaveLength(0);
    await setSettings(u, { warningDays: 7 });
    expect((await list(u)).notifications.map((n) => n.type)).toEqual(["EXPIRING"]);
  });
});

describe("notifications: reading, deleting and privacy", () => {
  it("mark one read, delete one, unread count follows", async () => {
    const u = await newUser("n");
    await createItem(u, { expiryDate: day(-1) });
    await createItem(u, { expiryDate: day(1) });
    const [a, b] = (await list(u)).notifications;
    expect((await u.post(`/api/notifications/${a.id}/read`)).status).toBeLessThan(300);
    expect((await u.get("/api/notifications/unread-count")).body.unread).toBe(1);
    expect((await u.del(`/api/notifications/${b.id}`)).status).toBeLessThan(300);
    const after = await list(u);
    expect(after.notifications.map((n) => n.id)).toEqual([a.id]);
    expect(after.unread).toBe(0);
  });

  it("another user can't read, mark or delete my alerts", async () => {
    const owner = await newUser("n");
    const other = await newUser("n");
    await createItem(owner, { expiryDate: day(1) });
    const [n] = (await list(owner)).notifications;
    expect((await list(other)).notifications).toHaveLength(0);
    expect((await other.post(`/api/notifications/${n.id}/read`)).status).toBe(404);
    expect((await other.del(`/api/notifications/${n.id}`)).status).toBe(404);
    expect((await list(owner)).unread).toBe(1);
  });

  it("requires sign-in", async () => {
    const u = await newUser("n");
    await u.post("/api/auth/logout");
    expect((await u.get("/api/notifications")).status).toBe(401);
  });
});

describe("daily email reminders", () => {
  const inbox: { to: string; raw: string }[] = [];
  let server: SMTPServer;
  let rejectMail = false;
  const saved = { ...config.smtp };

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      onRcptTo(addr, _s, cb) { cb(rejectMail ? Object.assign(new Error("mailbox unavailable"), { responseCode: 550 }) : undefined); void addr; },
      onData(stream, session, cb) {
        let raw = "";
        stream.on("data", (c) => (raw += c));
        stream.on("end", () => { inbox.push({ to: session.envelope.rcptTo[0].address, raw }); cb(); });
      },
    });
    await new Promise<void>((r) => server.listen(2526, "127.0.0.1", r));
    Object.assign(config.smtp, { host: "127.0.0.1", port: 2526, user: "", pass: "" });
  });
  afterAll(async () => {
    Object.assign(config.smtp, saved);
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("emails a digest once, records SENT, and doesn't email again next day", async () => {
    const u = await newUser("mail");
    await setSettings(u, { emailReminders: true });
    await createItem(u, { name: "Bread", expiryDate: day(1) });
    await runDailyReminders();
    const mine = inbox.filter((m) => m.to === u.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].raw).toContain("Bread expires soon");
    expect(mine[0].raw).toMatch(/Subject: Smart Pantry: 1 item\(s\) need attention/);
    expect((await list(u)).notifications[0].emailStatus).toBe("SENT");
    await runDailyReminders();
    expect(inbox.filter((m) => m.to === u.email)).toHaveLength(1);
  });

  it("doesn't email users who turned email off", async () => {
    const u = await newUser("mail");
    await setSettings(u, { emailReminders: false });
    await createItem(u, { expiryDate: day(1) });
    await runDailyReminders();
    expect(inbox.some((m) => m.to === u.email)).toBe(false);
    expect((await list(u)).notifications[0].emailStatus).toBe("NOT_REQUESTED");
  });

  it("records FAILED honestly when the mail server refuses", async () => {
    const u = await newUser("mail");
    await setSettings(u, { emailReminders: true });
    await createItem(u, { expiryDate: day(1) });
    rejectMail = true;
    try { await runDailyReminders(); } finally { rejectMail = false; }
    expect((await list(u)).notifications[0].emailStatus).toBe("FAILED");
  });
});

afterAll(() => prisma.$disconnect());

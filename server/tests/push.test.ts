import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Record pushes instead of contacting Google/Apple/Mozilla push services
const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
const goneEndpoints = new Set<string>();
vi.mock("web-push", async (orig) => {
  const real = (await orig()) as { default: Record<string, unknown> };
  return {
    default: {
      ...real.default,
      sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => {
        if (goneEndpoints.has(sub.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
        return { statusCode: 201 };
      }),
    },
  };
});

const { prisma } = await import("../src/db.js");
const { runDailyReminders } = await import("../src/services/notifications.js");
const { createItem, day, newUser } = await import("./helpers.js");

const sub = (n: string) => ({ endpoint: `https://push.example.com/send/${n}-${Math.random()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
beforeEach(() => void (sent.length = 0));

describe("phone/browser push notifications", () => {
  it("gives a stable public key the browser needs to subscribe", async () => {
    const u = await newUser("p");
    const a = (await u.get("/api/push/public-key")).body.publicKey;
    const b = (await u.get("/api/push/public-key")).body.publicKey;
    expect(a).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b).toBe(a);
  });

  it("subscribe, send a test, unsubscribe", async () => {
    const u = await newUser("p");
    expect((await u.post("/api/push/test")).status).toBe(400); // nothing to send to yet
    const s = sub("phone");
    expect((await u.post("/api/push/subscribe", s)).body.devices).toBe(1);
    expect((await u.post("/api/push/subscribe", s)).body.devices).toBe(1); // re-subscribing doesn't duplicate
    expect((await u.post("/api/push/test")).body).toEqual({ sent: 1, failed: 0 });
    expect(sent[0].payload.title).toBe("Smart Pantry");
    await u.post("/api/push/unsubscribe", { endpoint: s.endpoint });
    expect((await u.get("/api/push/status")).body.devices).toBe(0);
  });

  it("rejects bad subscriptions", async () => {
    const u = await newUser("p");
    expect((await u.post("/api/push/subscribe", { endpoint: "http://insecure.example.com/x", keys: { p256dh: "a", auth: "b" } })).status).toBe(400);
    expect((await u.post("/api/push/subscribe", { endpoint: "https://x.example.com" })).status).toBe(400);
  });

  it("daily job pushes one summary to every household device, only once", async () => {
    const owner = await newUser("p");
    const member = await newUser("p");
    const code = (await owner.post("/api/household", { name: "Push family" })).body.household.inviteCode;
    await member.post("/api/household/join", { code });
    const so = sub("owner");
    const sm = sub("member");
    await owner.post("/api/push/subscribe", so);
    await member.post("/api/push/subscribe", sm);
    await createItem(owner, { name: "Milk", expiryDate: day(1) });
    await createItem(owner, { name: "Old Curd", expiryDate: day(-1), purchaseDate: day(-5) });
    await runDailyReminders();
    const mine = sent.filter((p) => p.endpoint === so.endpoint || p.endpoint === sm.endpoint);
    expect(mine).toHaveLength(2);
    expect(mine[0].payload.title).toBe("2 items need attention");
    expect(mine[0].payload.body).toMatch(/Milk expires soon|Old Curd has expired/);
    expect(mine[0].payload.url).toBe("/notifications");
    sent.length = 0;
    await runDailyReminders();
    expect(sent.filter((p) => p.endpoint === so.endpoint)).toHaveLength(0);
  });

  it("removes a device whose subscription has expired", async () => {
    const u = await newUser("p");
    const s = sub("gone");
    await u.post("/api/push/subscribe", s);
    goneEndpoints.add(s.endpoint);
    expect((await u.post("/api/push/test")).body).toEqual({ sent: 0, failed: 1 });
    expect((await u.get("/api/push/status")).body.devices).toBe(0);
  });

  it("view-only members can still manage their own phone notifications", async () => {
    const owner = await newUser("p");
    const viewer = await newUser("p");
    const h = (await owner.post("/api/household", { name: "V" })).body.household;
    await viewer.post("/api/household/join", { code: h.inviteCode });
    const vid = (await owner.get("/api/household")).body.household.members[0].userId;
    await owner.patch(`/api/household/members/${vid}`, { role: "VIEWER" });
    expect((await viewer.post("/api/push/subscribe", sub("viewer"))).status).toBe(200);
  });
});

afterAll(() => prisma.$disconnect());

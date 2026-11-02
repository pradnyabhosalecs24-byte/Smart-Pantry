import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { createItem, day, newUser, type TestUser } from "./helpers.js";

const items = async (u: TestUser) => ((await u.get("/api/items?pageSize=100")).body.items as { id: string; name: string }[]).map((i) => i.name).sort();

async function family() {
  const owner = await newUser("owner");
  const member = await newUser("member");
  const created = await owner.post("/api/household", { name: "Sharma family" });
  expect(created.status).toBe(201);
  const code = created.body.household.inviteCode as string;
  expect(code).toMatch(/^[A-Z2-9]{8}$/);
  return { owner, member, code };
}

describe("family sharing", () => {
  it("a member joins with the code and shares one pantry both ways", async () => {
    const { owner, member, code } = await family();
    await createItem(owner, { name: "Owner Rice" });
    await createItem(member, { name: "My Secret Snack" });
    // codes are forgiving about case and spaces
    const join = await member.post("/api/household/join", { code: ` ${code.slice(0, 4).toLowerCase()} ${code.slice(4)} ` });
    expect(join.status).toBe(200);
    expect(join.body.role).toBe("EDITOR");
    expect(join.body.household.inviteCode).toBeNull(); // only the owner sees the code
    expect(await items(member)).toEqual(["Owner Rice"]);
    await createItem(member, { name: "Milk", expiryDate: day(1) });
    expect(await items(owner)).toEqual(["Milk", "Owner Rice"]);
    // shared alerts, and the activity log says who did it
    expect((await owner.get("/api/notifications")).body.notifications.some((n: { title: string }) => n.title === "Milk expires soon")).toBe(true);
    const acts = (await owner.get("/api/activity")).body.activities as { message: string; actorName: string | null }[];
    expect(acts.find((a) => a.message.includes("Milk"))?.actorName).toBe("member");
    expect(acts.some((a) => a.message === "member joined the household")).toBe(true);
    // leaving brings the member's own pantry back untouched
    expect((await member.post("/api/household/leave")).status).toBe(200);
    expect(await items(member)).toEqual(["My Secret Snack"]);
    expect(await items(owner)).toEqual(["Milk", "Owner Rice"]);
  });

  it("viewers can look but not change anything", async () => {
    const { owner, member, code } = await family();
    const rice = await createItem(owner, { name: "Rice" });
    await member.post("/api/household/join", { code });
    const ownerView = (await owner.get("/api/household")).body;
    expect(ownerView.household.members).toHaveLength(1);
    expect((await owner.patch(`/api/household/members/${ownerView.household.members[0].userId}`, { role: "VIEWER" })).status).toBe(200);
    expect(await items(member)).toEqual(["Rice"]);
    const blocked = await member.post(`/api/items/${rice.id}/consume`, { quantity: 1 });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("VIEW_ONLY");
    expect((await member.del(`/api/items/${rice.id}`)).status).toBe(403);
    expect((await member.post("/api/shopping", { name: "Eggs" })).status).toBe(403);
    // personal actions still work
    expect((await member.post("/api/notifications/read-all")).status).toBe(200);
    expect((await member.post("/api/household/leave")).status).toBe(200);
  });

  it("only the owner manages the household, and removal takes effect immediately", async () => {
    const { owner, member, code } = await family();
    await createItem(owner, { name: "Dal" });
    await member.post("/api/household/join", { code });
    const mid = (await owner.get("/api/household")).body.household.members[0].userId;
    expect((await member.post("/api/household/invite-code")).status).toBe(403);
    expect((await member.patch("/api/household", { name: "Mine now" })).status).toBe(403);
    expect((await member.del(`/api/household/members/${mid}`)).status).toBe(403);
    expect((await member.post("/api/data/restore", { backup: {}, dryRun: true })).status).toBe(403);
    expect((await owner.del(`/api/household/members/${mid}`)).status).toBe(200);
    expect(await items(member)).toEqual([]);
    expect((await member.get("/api/household")).body.household).toBeNull();
  });

  it("a new invite code stops the old one working", async () => {
    const { owner, member, code } = await family();
    const fresh = (await owner.post("/api/household/invite-code")).body.household.inviteCode;
    expect(fresh).not.toBe(code);
    expect((await member.post("/api/household/join", { code })).status).toBe(404);
    expect((await member.post("/api/household/join", { code: fresh })).status).toBe(200);
  });

  it("refuses joining twice, joining your own, or creating while a member", async () => {
    const { owner, member, code } = await family();
    expect((await owner.post("/api/household/join", { code })).status).toBe(409);
    expect((await owner.post("/api/household", { name: "Second" })).status).toBe(409);
    await member.post("/api/household/join", { code });
    expect((await member.post("/api/household/join", { code })).status).toBe(409);
    expect((await member.post("/api/household", { name: "Breakaway" })).status).toBe(409);
    // an owner with members can't join elsewhere
    const third = await newUser("third");
    const other = (await third.post("/api/household", { name: "Other" })).body.household.inviteCode;
    expect((await owner.post("/api/household/join", { code: other })).body.error.code).toBe("HAS_MEMBERS");
    expect((await third.post("/api/household/join", { code: "" })).status).toBe(400);
  });

  it("deleting the household, or the owner's account, frees everyone without deleting their data", async () => {
    const { owner, member, code } = await family();
    await createItem(member, { name: "Member Oats" });
    await member.post("/api/household/join", { code });
    expect((await owner.del("/api/household")).status).toBe(200);
    expect(await items(member)).toEqual(["Member Oats"]);

    const o2 = await newUser("owner2");
    const c2 = (await o2.post("/api/household", { name: "H2" })).body.household.inviteCode;
    await member.post("/api/household/join", { code: c2 });
    expect((await o2.agent.delete("/api/auth/me").set("X-Requested-With", "SmartPantry").send({ password: "pantry123", confirm: "DELETE" })).status).toBeLessThan(300);
    expect(await items(member)).toEqual(["Member Oats"]);
  });

  it("strangers can't see a household", async () => {
    const { owner } = await family();
    await createItem(owner, { name: "Private" });
    const stranger = await newUser("stranger");
    expect((await stranger.get("/api/household")).body.household).toBeNull();
    expect(await items(stranger)).toEqual([]);
  });
});

afterAll(() => prisma.$disconnect());

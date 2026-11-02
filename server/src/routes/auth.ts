import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config, emailConfigured } from "../config.js";
import { prisma } from "../db.js";
import { DEFAULT_CATEGORIES, DEFAULT_LOCATIONS } from "../lib/defaults.js";
import { conflict, handler, HttpError, parse } from "../lib/http.js";
import { sendMail } from "../lib/mailer.js";
import { actorId, clearAuthCookie, requireAuth, setAuthCookie, signToken } from "../middleware/auth.js";

export const authRouter = Router();

// Slows down password guessing: 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { message: "Too many attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" } },
});

const email = z.string({ error: "Email is required" }).trim().toLowerCase().email("Enter a valid email address").max(254);
const password = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-real-password", 12);

const publicUser =(u: { id: string; name: string; email: string; createdAt: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
});

authRouter.post(
  "/register",
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(1, "Name is required").max(80), email, password }), req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw conflict("An account with this email already exists", "EMAIL_TAKEN", { fields: { email: "Already registered — try signing in" } });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: body.name, email: body.email, passwordHash } });
      await tx.settings.create({ data: { userId: u.id } });
      await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: u.id })) });
      await tx.location.createMany({ data: DEFAULT_LOCATIONS.map((name) => ({ name, userId: u.id })) });
      return u;
    });
    setAuthCookie(res, signToken(user.id, user.tokenVersion));
    res.status(201).json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/login",
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1, "Password is required").max(128) }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Same message whether the email or the password is wrong, so accounts can't be discovered
    // Compare against a dummy hash when the user doesn't exist so response time doesn't reveal it
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Invalid email or password", "INVALID_CREDENTIALS");
    setAuthCookie(res, signToken(user.id, user.tokenVersion));
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  handler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId(req) } });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.patch(
  "/me",
  requireAuth,
  handler(async (req, res) => {
    const body = parse(z.object({ name: z.string().trim().min(1, "Name is required").max(80) }), req.body);
    const user = await prisma.user.update({ where: { id: actorId(req) }, data: { name: body.name } });
    res.json({ user: publicUser(user) });
  }),
);

authRouter.post(
  "/change-password",
  requireAuth,
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().min(1, "Current password is required"), newPassword: password }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId(req) } });
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, "Current password is incorrect", "VALIDATION_ERROR", { fields: { currentPassword: "Incorrect password" } });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12), tokenVersion: { increment: 1 } },
    });
    // Old sessions are now invalid; keep this one signed in with a fresh token
    setAuthCookie(res, signToken(updated.id, updated.tokenVersion));
    res.json({ ok: true });
  }),
);

/** Signs out every device (e.g. a lost phone) by invalidating all existing login tokens. */
authRouter.post(
  "/logout-all",
  requireAuth,
  handler(async (req, res) => {
    await prisma.user.update({ where: { id: actorId(req) }, data: { tokenVersion: { increment: 1 } } });
    clearAuthCookie(res);
    res.json({ ok: true });
  }),
);

/** Permanently deletes the account and all its data. Needs the password and a typed confirmation. */
authRouter.delete(
  "/me",
  requireAuth,
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ password: z.string().min(1, "Enter your password"), confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }) }), req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId(req) } });
    if (!(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(400, "Password is incorrect", "VALIDATION_ERROR", { fields: { password: "Incorrect password" } });
    }
    // Every table references the user with ON DELETE CASCADE, so this removes all of their data
    await prisma.user.delete({ where: { id: user.id } });
    clearAuthCookie(res);
    res.json({ ok: true });
  }),
);

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

authRouter.post(
  "/forgot-password",
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!emailConfigured()) {
      // Honest behaviour: we do not claim an email was sent when the server cannot send email.
      let devResetUrl: string | undefined;
      if (user && config.devShowResetLink) devResetUrl = await createResetLink(user.id);
      res.json({
        emailConfigured: false,
        message: config.devShowResetLink
          ? "Email is not configured in this development setup."
          : "Password reset by email is not configured on this server. Please contact the administrator.",
        devResetUrl,
      });
      return;
    }

    if (user) {
      const link = await createResetLink(user.id);
      const status = await sendMail(
        user.email,
        "Reset your Smart Pantry password",
        `Hi ${user.name},\n\nUse this link within 30 minutes to choose a new password:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
      );
      if (status !== "SENT") throw new HttpError(502, "We couldn't send the reset email. Please try again later.", "EMAIL_FAILED");
    }
    // Same response whether or not the account exists, so emails can't be probed
    res.json({ emailConfigured: true, message: "If an account exists for that email, a reset link has been sent." });
  }),
);

async function createResetLink(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  return `${config.clientUrl}/reset-password?token=${token}`;
}

authRouter.post(
  "/reset-password",
  authLimiter,
  handler(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(10, "Reset link is invalid"), password }), req.body);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, "This reset link is invalid or has expired. Please request a new one.", "INVALID_TOKEN");
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(body.password, 12), tokenVersion: { increment: 1 } },
      }),
      // Single use: mark this and every other outstanding link for the user as used
      prisma.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    clearAuthCookie(res);
    res.json({ ok: true, message: "Password updated. Please sign in with your new password." });
  }),
);

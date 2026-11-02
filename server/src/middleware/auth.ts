import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { handler, HttpError } from "../lib/http.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Whose pantry this request works on: the user's own, or their household owner's */
      userId?: string;
      /** The person actually signed in */
      actorId?: string;
      /** OWNER for your own pantry, otherwise your household role */
      pantryRole?: PantryRole;
    }
  }
}

export const AUTH_COOKIE = "sp_token";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  sub: string;
  tv: number; // token version: changes on password reset, which invalidates old sessions
}

export function signToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ sub: userId, tv: tokenVersion } satisfies TokenPayload, config.jwtSecret, { expiresIn: "7d" });
}

/**
 * The token lives in an httpOnly cookie, so page JavaScript (and any injected script) can't read it.
 * In production the frontend proxies /api to the backend, so the cookie stays first-party.
 */
export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: SEVEN_DAYS_MS,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" });
}

export type PantryRole = "OWNER" | "EDITOR" | "VIEWER";

/** Who is acting in the current request, so the activity log can say "by Asha" without threading it everywhere. */
export const actorContext = new AsyncLocalStorage<{ actorName: string | null }>();

const unauthorized = () => new HttpError(401, "Please sign in to continue", "UNAUTHORIZED");

export const requireAuth = handler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as unknown as TokenPayload;
  } catch {
    throw unauthorized();
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, tokenVersion: true, membership: { select: { role: true, household: { select: { ownerId: true } } } } },
  });
  if (!user || user.tokenVersion !== payload.tv) throw unauthorized();
  req.actorId = user.id;
  // Members of a household work on the owner's pantry. Checked on every request, so removal takes effect at once.
  req.userId = user.membership ? user.membership.household.ownerId : user.id;
  req.pantryRole = user.membership ? (user.membership.role === "VIEWER" ? "VIEWER" : "EDITOR") : "OWNER";
  actorContext.run({ actorName: user.membership ? user.name : null }, () => next());
});

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Personal actions a view-only member may still take
const VIEWER_ALLOWED = [/^\/household(\/|$)/, /^\/notifications(\/|$)/, /^\/gamification\/seen$/, /^\/push(\/|$)/];

/** View-only household members can read everything but change nothing in the shared pantry. */
export const blockViewerWrites = handler(async (req, _res, next) => {
  if (req.pantryRole === "VIEWER" && !READ_METHODS.has(req.method) && !VIEWER_ALLOWED.some((r) => r.test(req.path))) {
    throw new HttpError(403, "You have view-only access to this household pantry. Ask the owner for edit access.", "VIEW_ONLY");
  }
  next();
});

/** Only the pantry owner may do this (e.g. restore a backup over the shared pantry). */
export function requireOwner(req: Request) {
  if (req.pantryRole && req.pantryRole !== "OWNER") throw new HttpError(403, "Only the household owner can do this.", "OWNER_ONLY");
}

/** The signed-in person (not the shared pantry). Use for account, password and household actions. */
export function actorId(req: Request): string {
  if (!req.actorId) throw unauthorized();
  return req.actorId;
}

/** The pantry owner's id. Every pantry query in a protected route is filtered by it. */
export function uid(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

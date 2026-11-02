import type { ErrorRequestHandler, RequestHandler } from "express";
import { config } from "../config.js";
import { Prisma } from "../db.js";
import { HttpError } from "../lib/http.js";

export const notFoundRoute: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `No API route for ${req.method} ${req.path}`, "NOT_FOUND"));
};

/** One place that turns every error into a clear JSON response. Internals are never leaked. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const where = JSON.stringify(err.meta ?? {}) + err.message;
      const message = /email/i.test(where) ? "An account with this email already exists" : /name/i.test(where) ? "That name is already in use" : "This was already saved. Refresh to see it.";
      res.status(409).json({ error: { message, code: "DUPLICATE" } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: { message: "Record not found", code: "NOT_FOUND" } });
      return;
    }
    if (err.code === "P2003") {
      res.status(409).json({ error: { message: "This record is still in use by other records", code: "IN_USE" } });
      return;
    }
  }
  // Malformed JSON body
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { message: "Request body is not valid JSON", code: "BAD_JSON" } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { message: "Request is too large", code: "TOO_LARGE" } });
    return;
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: { message: "Image must be 2 MB or smaller", code: "TOO_LARGE" } });
    return;
  }
  const dbDown = err?.code === "ECONNREFUSED" || /Can't reach database|connect ECONNREFUSED|Connection terminated/i.test(String(err?.message));
  if (!config.isTest) console.error("[error]", err);
  if (dbDown) {
    res.status(503).json({ error: { message: "The database is unavailable right now. Please try again shortly.", code: "DB_UNAVAILABLE" } });
    return;
  }
  res.status(500).json({ error: { message: "Something went wrong on our side. Please try again.", code: "INTERNAL" } });
};

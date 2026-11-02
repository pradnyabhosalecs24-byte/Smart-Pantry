import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

/** Errors thrown with a status code and a message that is safe to show to users. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "BAD_REQUEST", details);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`, "NOT_FOUND");
export const conflict = (msg: string, code = "CONFLICT", details?: unknown) => new HttpError(409, msg, code, details);

/** Validates input with a Zod schema; field errors go back as { field: message }. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(400, "Please fix the highlighted fields", "VALIDATION_ERROR", { fields });
  }
  return result.data;
}

/** Express 5 forwards rejected promises automatically; this just gives typed handlers. */
export const handler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function pageParams(q: Request["query"], maxSize = 100) {
  const page = Math.max(1, Number.parseInt(String(q.page ?? "1"), 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(String(q.pageSize ?? "20"), 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export const param = (req: Request, name: string): string => String(req.params[name]);

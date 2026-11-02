import type { RequestHandler } from "express";
import { HttpError } from "../lib/http.js";

/**
 * CSRF protection: every state-changing request must carry a custom header.
 * Browsers won't let another website add custom headers to a cross-site request
 * without a CORS pre-flight, which our CORS policy rejects. Combined with SameSite
 * cookies this blocks forged form submissions from other sites.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-requested-with") !== "SmartPantry") {
    return next(new HttpError(403, "Request blocked by CSRF protection", "CSRF"));
  }
  next();
};

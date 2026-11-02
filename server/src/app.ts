import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { UNIT_LIST, UNITS } from "./lib/units.js";
import { blockViewerWrites, requireAuth } from "./middleware/auth.js";
import { errorHandler, notFoundRoute } from "./middleware/errors.js";
import { requireCsrfHeader } from "./middleware/security.js";
import { accountRouter } from "./routes/account.js";
import { authRouter } from "./routes/auth.js";
import { dataRouter } from "./routes/data.js";
import { extrasRouter } from "./routes/extras.js";
import { insightsRouter } from "./routes/insights.js";
import { itemsRouter } from "./routes/items.js";
import { householdRouter } from "./routes/household.js";
import { pushRouter } from "./routes/push.js";
import { gamificationRouter } from "./routes/gamification.js";
import { recipesRouter } from "./routes/recipes.js";
import { shoppingRouter } from "./routes/shopping.js";
import { taxonomyRouter } from "./routes/taxonomy.js";

export function createApp() {
  const app = express();
  // Render / Vercel sit behind a proxy; needed for correct client IPs in rate limiting
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: config.clientUrl.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.isTest ? 100_000 : 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { message: "Too many requests. Please slow down.", code: "RATE_LIMITED" } },
    }),
  );

  // Public endpoints
  app.get("/api/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "connected", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: "degraded", database: "unreachable" });
    }
  });
  app.get("/api/meta", (_req, res) => {
    res.json({ units: UNIT_LIST.map((u) => ({ value: u, label: UNITS[u].label, group: UNITS[u].group })) });
  });

  app.use("/api", requireCsrfHeader);
  app.use("/api/auth", authRouter);

  // Everything below requires a signed-in user, and every query is scoped to that user
  const api = express.Router();
  api.use(requireAuth);
  api.use(blockViewerWrites);
  api.use("/household", householdRouter);
  api.use("/push", pushRouter);
  api.use("/items", itemsRouter);
  api.use("/categories", taxonomyRouter("category"));
  api.use("/locations", taxonomyRouter("location"));
  api.use("/shopping", shoppingRouter);
  api.use("/data", dataRouter);
  api.use("/recipes", recipesRouter);
  api.use("/gamification", gamificationRouter);
  api.use("/", insightsRouter);
  api.use("/", accountRouter);
  api.use("/", extrasRouter);
  app.use("/api", api);

  app.use("/api", notFoundRoute);
  app.use(errorHandler);
  return app;
}

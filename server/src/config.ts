import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}. See server/.env.example`);
  return v;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const jwtSecret = required("JWT_SECRET");
if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

export const config = {
  nodeEnv,
  isProd: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "Smart Pantry <no-reply@example.com>",
  },
  // Shows password-reset links on screen when email isn't configured. Development only, and must be switched on
  // explicitly, so a server deployed without NODE_ENV=production never hands out reset links.
  devShowResetLink: nodeEnv !== "production" && process.env.DEV_SHOW_RESET_LINK === "true",
  onlineRecipesEnabled: (process.env.ONLINE_RECIPES_ENABLED ?? "true") !== "false",
  barcodeLookupEnabled: (process.env.BARCODE_LOOKUP_ENABLED ?? "true") !== "false",
  reminderCron: process.env.REMINDER_CRON ?? "0 8 * * *",
};

export const emailConfigured = (): boolean => Boolean(config.smtp.host);

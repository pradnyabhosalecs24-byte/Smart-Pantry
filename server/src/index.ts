import cron from "node-cron";
import { createApp } from "./app.js";
import { config, emailConfigured } from "./config.js";
import { prisma } from "./db.js";
import { cleanupStaleData, runDailyReminders } from "./services/notifications.js";

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Smart Pantry API listening on http://localhost:${config.port}`);
  console.log(`Email reminders: ${emailConfigured() ? "enabled (SMTP configured)" : "disabled (SMTP_HOST not set)"}`);
});

// Daily reminder job. In-app alerts are also refreshed whenever a user opens the app,
// so nothing is missed if the server was asleep (e.g. on a free hosting plan).
if (cron.validate(config.reminderCron)) {
  cron.schedule(config.reminderCron, async () => {
    const result = await runDailyReminders().catch((err) => {
      console.error("[reminders] job failed:", err);
      return null;
    });
    if (result) console.log(`[reminders] checked ${result.users} pantries, emailed ${result.emailed}, pushed to ${result.pushed}`);
    const cleaned = await cleanupStaleData().catch(() => null);
    if (cleaned) console.log(`[cleanup] removed ${cleaned.images} unused photo(s), ${cleaned.tokens} old reset link(s)`);
  });
} else {
  console.warn(`[reminders] REMINDER_CRON "${config.reminderCron}" is invalid; daily job disabled`);
}

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

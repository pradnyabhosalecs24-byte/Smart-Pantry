import { defineConfig } from "vitest/config";

// Integration tests run against a real PostgreSQL database (never the development one).
// TEST_DATABASE_URL defaults to a local "smart_pantry_test" database; CI provides its own.
const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://pantry:pantry@localhost:5432/smart_pantry_test";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDb,
      JWT_SECRET: "test-secret-that-is-long-enough-for-the-config-check-0123456789",
      CLIENT_URL: "http://localhost:5173",
      SMTP_HOST: "",
      BARCODE_LOOKUP_ENABLED: "false",
      ONLINE_RECIPES_ENABLED: "false",
      DEV_SHOW_RESET_LINK: "true",
    },
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});

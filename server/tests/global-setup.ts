import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Rebuilds the test database from the real migration files before the test run,
 * so tests always exercise exactly the schema that production gets.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://pantry:pantry@localhost:5432/smart_pantry_test";
  if (!/test/i.test(url)) throw new Error(`Refusing to reset a database whose name doesn't contain "test": ${url}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    const dir = path.resolve(import.meta.dirname, "../prisma/migrations");
    const migrations = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const m of migrations) await client.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  } finally {
    await client.end();
  }
}

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "./generated/prisma/client.js";
import { config } from "./config.js";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });
export const prisma = new PrismaClient({ adapter });
export { Prisma };

export type Tx = Prisma.TransactionClient;

/**
 * Serialises work on one logical key (e.g. "demo:<userId>") until the transaction ends.
 * Used where two identical requests arriving together (a double-click) must not both succeed.
 */
export async function lockKey(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

/** Prisma returns Decimal objects; the API always sends plain numbers. */
export function num(d: Prisma.Decimal | number | null | undefined): number {
  if (d == null) return 0;
  return typeof d === "number" ? d : Number(d.toString());
}

export function numOrNull(d: Prisma.Decimal | number | null | undefined): number | null {
  return d == null ? null : num(d);
}

import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 reads the connection string from here (not from schema.prisma).
// `prisma generate` does not need a database, so a placeholder keeps installs working without one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});

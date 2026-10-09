import type { Config } from "drizzle-kit";

// ponytail: SQL di drizzle/*.sql adalah source of truth (PRD §5.3 literal);
// schema TS dibuat saat tiket API butuh query typed (lihat lib/db.ts).
export default {
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;

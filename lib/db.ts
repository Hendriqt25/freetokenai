import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ponytail: singleton via globalThis agar dev-reload Next.js tidak bikin pool baru.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/resto_ai_dev", {
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql);
export { sql };

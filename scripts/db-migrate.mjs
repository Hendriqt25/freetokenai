// ponytail: migrate = eksekusi drizzle/*.sql apa adanya, tanpa journal.
// Idempoten (IF NOT EXISTS) jadi aman diulang. Butuh DATABASE_URL.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

function loadEnv() {
  // ponytail: parser .env 5 baris, tanpa dep dotenv.
  for (const f of [".env", ".env.local"]) {
    try {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          process.env[m[1]] = v;
        }
      }
    } catch {
      // file tidak ada -> abaikan
    }
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum di-set (lihat .env.example).");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (!files.length) {
  console.error("Tidak ada file SQL di ./drizzle.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  for (const f of files) {
    await sql.unsafe(readFileSync(join(dir, f), "utf8"));
    console.log(`migrated: ${f}`);
  }
} finally {
  await sql.end();
}
console.log("db:migrate OK");

// ponytail: seed dev minimal — 1 user + 1 workspace 1500 Token aktif 7 hari,
// agar billing bisa didemokan tanpa klaim QR. Idempoten via email.
import { readFileSync } from "node:fs";
import postgres from "postgres";

function loadEnv() {
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
      // abaikan
    }
  }
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum di-set (lihat .env.example).");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const users = await sql`
    INSERT INTO users (email, password_hash)
    VALUES ('dev@example.com', 'dev-only-not-a-real-hash')
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id`;
  const userId = users[0].id;

  const ws = await sql`
    INSERT INTO workspaces (owner_id, name, token_balance, active_until)
    VALUES (${userId}, 'Dev Workspace', 1500, now() + interval '7 days')
    ON CONFLICT DO NOTHING
    RETURNING id, token_balance`;
  // ponytail: tanpa unique constraint alami -> ambil workspace dev milik user bila sudah ada.
  const row =
    ws[0] ??
    (
      await sql`
        SELECT id, token_balance FROM workspaces
        WHERE owner_id = ${userId} AND name = 'Dev Workspace' LIMIT 1`
    )[0];

  await sql`
    INSERT INTO token_transactions (workspace_id, delta, reason)
    SELECT ${row.id}, 1500, 'seed'
    WHERE NOT EXISTS (
      SELECT 1 FROM token_transactions WHERE workspace_id = ${row.id} AND reason = 'seed'
    )`;

  const check = await sql`SELECT token_balance FROM workspaces WHERE id = ${row.id}`;
  console.log(`seed OK: workspace dev ${row.id} = ${check[0].token_balance} Token`);
} finally {
  await sql.end();
}

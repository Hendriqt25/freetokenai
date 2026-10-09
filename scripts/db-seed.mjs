// ponytail: seed dev minimal — 1 user + 1 workspace 1500 Token aktif 7 hari,
// agar billing bisa didemokan tanpa klaim QR. Idempoten via email + SELECT fallback.
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
    INSERT INTO users (email, name, avatar_url)
    VALUES ('dev@example.com', 'Dev User', NULL)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  const userId = users[0].id;
  // phone_number unique terpisah -> UPDATE terpisah supaya idempoten ganda-arah.
  await sql`
    UPDATE users SET phone_number = '081200000001'
    WHERE id = ${userId} AND phone_number IS NULL`;

  let row = (
    await sql`
      SELECT id, token_balance FROM workspaces
      WHERE user_id = ${userId} ORDER BY created_at LIMIT 1`
  )[0];
  if (!row) {
    row = (
      await sql`
        INSERT INTO workspaces (user_id, token_balance, expires_at)
        VALUES (${userId}, 1500, now() + interval '7 days')
        RETURNING id, token_balance`
    )[0];
  }

  await sql`
    INSERT INTO token_transactions (workspace_id, type, amount, balance_after)
    SELECT ${row.id}, 'grant', 1500, 1500
    WHERE NOT EXISTS (
      SELECT 1 FROM token_transactions WHERE workspace_id = ${row.id} AND type = 'grant'
    )`;

  const check = await sql`SELECT token_balance, expires_at FROM workspaces WHERE id = ${row.id}`;
  console.log(
    `seed OK: workspace dev ${row.id} = ${check[0].token_balance} Token, aktif s/d ${check[0].expires_at}`
  );
} finally {
  await sql.end();
}

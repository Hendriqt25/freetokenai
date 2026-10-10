// ponytail: seed dev multi-tenant — 2 cafe (dengan saldo prepaid + ledger topup),
// 1 super admin, 1 kasir per cafe, 2 paket token default, + customer dev (dev@example.com)
// agar auto-login TASK-001 dan billing tetap jalan. Idempoten: upsert by slug/email, ledger sekali.
// Admin (TASK-023): admin_password_hash di-set via scrypt dengan PEPPER SAMA yang dipakai
// runtime (ADMIN_PASSWORD_PEPPER default dev). Password akun admin dev:
//   admin@example.com / Admin123! , kasir.kopi@example.com / Kasir123! , kasir.lestari@example.com / Kasir123!
import { readFileSync } from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

// ponytail: SALINAN hardening admin-auth (lib) — seed CLI berdiri sendiri, tak bisa import TS.
const PEPPER = process.env.ADMIN_PASSWORD_PEPPER ?? "dev-only-pepper-TASK023";
function adminHash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password + PEPPER, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

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

async function upsertUser({ email, phone, name, role, cafeId }) {
  const rows = await sql`
    INSERT INTO users (email, name, role, cafe_id, avatar_url)
    VALUES (${email}, ${name}, ${role}, ${cafeId ?? null}, NULL)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, cafe_id = EXCLUDED.cafe_id
    RETURNING id`;
  const id = rows[0].id;
  if (phone) {
    // phone_number unique terpisah -> UPDATE terpisah supaya idempoten.
    await sql`UPDATE users SET phone_number = ${phone} WHERE id = ${id} AND phone_number IS NULL`;
  }
  return id;
}

try {
  // 2 cafe + saldo prepaid. ON CONFLICT hanya perbarui metadata — saldo & is_active tidak
  // di-reset agar ledger topup di bawah tetap konsisten saat seed diulang.
  const cafeRows = await sql`
    INSERT INTO cafes (slug, name, prepaid_token_balance)
    VALUES ('kopi-senja', 'Kopi Senja', 100000), ('warung-lestari', 'Warung Lestari', 50000)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, slug, prepaid_token_balance`;

  // Ledger topup proforma per cafe (sekali saja) supaya saldo prepaid terekonsiliasi.
  for (const c of cafeRows) {
    await sql`
      INSERT INTO cafe_token_transactions (cafe_id, type, amount, balance_after, reference_type)
      SELECT ${c.id}, 'topup', ${c.prepaid_token_balance}, ${c.prepaid_token_balance}, 'topup'
      WHERE NOT EXISTS (SELECT 1 FROM cafe_token_transactions WHERE cafe_id = ${c.id} AND type = 'topup')`;
  }

  const cafes = {};
  for (const c of cafeRows) cafes[c.slug] = c.id;

  // Super admin + 1 kasir per cafe (staff tidak butuh workspace — ia kelola cafe).
  // admin_password_hash idempoten: hanya di-set bila kosong supaya seed ulang tak menimpa ganti password.
  const admins = [
    { email: "admin@example.com", phone: "081200000000", name: "Super Admin", role: "super_admin", cafeId: null, pass: "Admin123!" },
    { email: "kasir.kopi@example.com", phone: "081200000002", name: "Kasir Kopi Senja", role: "kasir", cafeId: cafes["kopi-senja"], pass: "Kasir123!" },
    { email: "kasir.lestari@example.com", phone: "081200000003", name: "Kasir Warung Lestari", role: "kasir", cafeId: cafes["warung-lestari"], pass: "Kasir123!" },
  ];
  for (const a of admins) {
    const id = await upsertUser(a);
    await sql`
      UPDATE users SET admin_password_hash = ${adminHash(a.pass)}
      WHERE id = ${id} AND admin_password_hash IS NULL`;
  }

  // Paket token default (global, cafe_id NULL) — pilihan nominal kasir saat generate struk.
  await sql`
    INSERT INTO token_packages (name, rupiah_amount, tokens_granted, sort_order)
    SELECT 'Paket 10rb', 10000, 1500, 1
    WHERE NOT EXISTS (SELECT 1 FROM token_packages WHERE rupiah_amount = 10000 AND tokens_granted = 1500)`;
  await sql`
    INSERT INTO token_packages (name, rupiah_amount, tokens_granted, sort_order)
    SELECT 'Paket 25rb', 25000, 4000, 2
    WHERE NOT EXISTS (SELECT 1 FROM token_packages WHERE rupiah_amount = 25000 AND tokens_granted = 4000)`;

  // Customer dev (auto-login) + workspace milik cafe pertama.
  const devId = await upsertUser({ email: "dev@example.com", phone: "081200000001", name: "Dev User", role: "customer", cafeId: cafes["kopi-senja"] });

  let row = await sql`
    SELECT id, token_balance FROM workspaces
    WHERE user_id = ${devId} ORDER BY created_at LIMIT 1`;
  if (!row[0]) {
    row = await sql`
      INSERT INTO workspaces (user_id, token_balance, expires_at, cafe_id)
      VALUES (${devId}, 1500, now() + interval '7 days', ${cafes["kopi-senja"]})
      RETURNING id, token_balance`;
  } else {
    await sql`UPDATE workspaces SET cafe_id = ${cafes["kopi-senja"]} WHERE id = ${row[0].id} AND cafe_id IS NULL`;
  }

  await sql`
    INSERT INTO token_transactions (workspace_id, type, amount, balance_after)
    SELECT ${row[0].id}, 'grant', 1500, 1500
    WHERE NOT EXISTS (
      SELECT 1 FROM token_transactions WHERE workspace_id = ${row[0].id} AND type = 'grant'
    )`;

  const check = await sql`SELECT token_balance, expires_at FROM workspaces WHERE id = ${row[0].id}`;
  const users = await sql`SELECT role, COALESCE(cafe_id::text, '-') AS cafe FROM users ORDER BY email`;
  console.log(
    `seed OK: ${cafeRows.length} cafe (${cafeRows.map((c) => `${c.slug}=${c.prepaid_token_balance}`).join(", ")}), ` +
      `${users.length} user (${users.map((u) => `${u.role}${u.cafe === "-" ? "" : "@cafe"}`).join(", ")}), ` +
      `workspace dev ${row[0].id} = ${check[0].token_balance} Token, aktif s/d ${check[0].expires_at}`
  );
} finally {
  await sql.end();
}
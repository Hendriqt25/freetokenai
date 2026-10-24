import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { requirePermission } from '@/lib/permissions';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/permissions';
import { createHash, randomBytes } from 'node:crypto';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mine = searchParams.get('mine') === '1';

  const auth = await requireAdmin(req, { roles: mine ? ['kasir', 'super_admin'] : ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Akses tidak sah.' } }, { status });
  }

  const statusFilter = searchParams.get('status')?.trim() ?? '';
  const search = searchParams.get('q')?.trim() ?? '';

  try {
    const rows = (await sql`
      SELECT
        k.id,
        k.key_prefix,
        k.name,
        k.is_active,
        k.token_quota,
        k.tokens_used,
        k.expires_at,
        k.revoked_at,
        k.revoked_reason,
        k.last_used_at,
        k.created_at,
        k.cafe_id,
        c.name AS cafe_name,
        k.package_id,
        p.name AS package_name,
        k.created_by_user_id,
        u.name AS creator_name,
        u.email AS creator_email
      FROM api_keys k
      LEFT JOIN cafes c ON c.id = k.cafe_id
      LEFT JOIN token_packages p ON p.id = k.package_id
      LEFT JOIN users u ON u.id = k.created_by_user_id
      WHERE
        (${mine ? sql`k.created_by_user_id = ${auth.user.id}` : sql`TRUE`})
        AND (${search ? sql`(k.key_prefix ILIKE ${'%' + search + '%'} OR k.name ILIKE ${'%' + search + '%'} OR c.name ILIKE ${'%' + search + '%'})` : sql`TRUE`})
      ORDER BY k.created_at DESC
      LIMIT 200`) as unknown as Array<{
      id: string;
      key_prefix: string;
      name: string | null;
      is_active: boolean;
      token_quota: number;
      tokens_used: number;
      expires_at: string | null;
      revoked_at: string | null;
      revoked_reason: string | null;
      last_used_at: string | null;
      created_at: string;
      cafe_id: string | null;
      cafe_name: string | null;
      package_id: string | null;
      package_name: string | null;
      created_by_user_id: string | null;
      creator_name: string | null;
      creator_email: string | null;
    }>;

    const now = Date.now();
    const mapped = rows.map((r) => {
      const remaining = Math.max(0, (r.token_quota ?? 0) - (r.tokens_used ?? 0));
      const pct = r.token_quota > 0 ? remaining / r.token_quota : 1;
      let status = 'active';
      if (r.revoked_at) status = 'revoked';
      else if (r.expires_at && new Date(r.expires_at).getTime() < now) status = 'expired';
      else if (remaining <= 0 && (r.token_quota ?? 0) > 0) status = 'exhausted';
      else if (pct <= 0.2) status = 'expiring';
      if (!r.is_active && !r.revoked_at) status = 'disabled';
      return { ...r, remaining, status };
    });

    const filtered = statusFilter ? mapped.filter((r) => r.status === statusFilter) : mapped;

    return NextResponse.json({ keys: filtered, total: filtered.length });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal memuat' } },
      { status: 500 },
    );
  }
}export async function POST(req: Request) {
  const auth = await requirePermission(req, "apikey.issue");
  if (typeof auth === "string") {
    const { status, message } = (auth === "unauthorized" || auth === "forbidden-origin" || auth === "forbidden-role" || auth === "forbidden-cafe")
      ? { status: auth === "unauthorized" ? 401 : 403, message: "Akses tidak sah." }
      : { status: 403, message: "Akun ini tidak memiliki izin untuk menerbitkan API key." };
    return NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status });
  }

  let body: {
    package_id?: unknown;
    name?: unknown;
    cafe_id?: unknown;
    quota_override?: unknown;
    expires_days_override?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY", message: "Body bukan JSON." } }, { status: 400 });
  }

  const packageId = typeof body.package_id === "string" ? body.package_id.trim() : "";
  if (!packageId) {
    return NextResponse.json({ error: { code: "PACKAGE_REQUIRED", message: "package_id wajib." } }, { status: 400 });
  }

  const pkg = (await sql`
    SELECT id, cafe_id, name, tokens_granted, is_active, default_expires_days, max_expires_days
    FROM token_packages WHERE id = ${packageId} LIMIT 1`) as unknown as Array<{
    id: string;
    cafe_id: string | null;
    name: string;
    tokens_granted: number;
    is_active: boolean;
    default_expires_days: number;
    max_expires_days: number;
  }>;
  if (!pkg[0] || !pkg[0].is_active) {
    return NextResponse.json({ error: { code: "PACKAGE_NOT_FOUND", message: "Paket tidak ditemukan / nonaktif." } }, { status: 404 });
  }

  const cafeId = typeof body.cafe_id === "string" && body.cafe_id.trim()
    ? body.cafe_id.trim()
    : (auth.user.cafe_id || pkg[0].cafe_id);
  if (!cafeId) {
    return NextResponse.json({ error: { code: "CAFE_REQUIRED", message: "cafe_id wajib (admin global harus memilih cafe)." } }, { status: 400 });
  }
  // kasir hanya boleh paket global atau milik cafenya
  if (auth.user.role === "kasir" && pkg[0].cafe_id !== null && pkg[0].cafe_id !== cafeId) {
    return NextResponse.json({ error: { code: "FORBIDDEN_CAFE", message: "Paket bukan milik cafe Anda." } }, { status: 403 });
  }
  if (auth.user.role === "kasir" && auth.user.cafe_id && auth.user.cafe_id !== cafeId) {
    return NextResponse.json({ error: { code: "FORBIDDEN_CAFE", message: "Cafe tidak sesuai akun kasir." } }, { status: 403 });
  }

  const name = (typeof body.name === "string" ? body.name.trim() : "").slice(0, 100) || pkg[0].name;

  const quotaOverride = typeof body.quota_override === "number" && body.quota_override > 0 ? Math.trunc(body.quota_override) : null;
  const tokens = quotaOverride ?? pkg[0].tokens_granted;

  const expiresOverride = typeof body.expires_days_override === "number" && body.expires_days_override > 0 ? body.expires_days_override : null;
  const expiresDays = expiresOverride ?? pkg[0].default_expires_days;
  if (expiresDays > pkg[0].max_expires_days) {
    return NextResponse.json({ error: { code: "INVALID_EXPIRY", message: `Maks ${pkg[0].max_expires_days} hari.` } }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx: any) => {
      // lock cafe
      const cafe = (await tx`SELECT id, prepaid_token_balance, is_active FROM cafes WHERE id = ${cafeId} FOR UPDATE`) as unknown as Array<{ id: string; prepaid_token_balance: number; is_active: boolean }>;
      if (!cafe[0] || !cafe[0].is_active) throw new Error("CAFE_NOT_FOUND");
      if (cafe[0].prepaid_token_balance < tokens) throw new Error("INSUFFICIENT_CAFE_QUOTA");

      // limit aktif per kasir
      const activeCount = (await tx`SELECT COUNT(*)::int AS c FROM api_keys WHERE created_by_user_id = ${auth.user.id} AND is_active = TRUE AND revoked_at IS NULL`) as unknown as Array<{ c: number }>;
      // ambil limit user
      const u = (await tx`SELECT max_active_keys, daily_issue_limit, keys_issued_today, keys_issued_date FROM users WHERE id = ${auth.user.id} FOR UPDATE`) as unknown as Array<{ max_active_keys: number; daily_issue_limit: number; keys_issued_today: number; keys_issued_date: string | null }>;
      if (!u[0]) throw new Error("USER_NOT_FOUND");
      if (activeCount[0].c >= u[0].max_active_keys) throw new Error("KEY_ACTIVE_LIMIT");

      // reset counter harian bila ganti hari
      const today = new Date().toISOString().slice(0, 10);
      let issuedToday = u[0].keys_issued_today;
      if (u[0].keys_issued_date !== today) issuedToday = 0;
      if (issuedToday >= u[0].daily_issue_limit) throw new Error("DAILY_ISSUE_LIMIT");

      // generate key
      const full = `rst_live_${randomBytes(16).toString("hex")}`;
      const keyHash = createHash("sha256").update(full).digest("hex");
      const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

      const rows = (await tx`
        INSERT INTO api_keys (workspace_id, key_hash, key_prefix, name, cafe_id, package_id, created_by_user_id, token_quota, tokens_used, expires_at, is_active)
        VALUES (NULL, ${keyHash}, ${full.slice(0, 10)}, ${name}, ${cafeId}, ${packageId}, ${auth.user.id}, ${tokens}, 0, ${expiresAt}, TRUE)
        RETURNING id, key_prefix, name, token_quota, expires_at, created_at`) as unknown as Array<{
        id: string;
        key_prefix: string;
        name: string;
        token_quota: number;
        expires_at: string;
        created_at: string;
      }>;

      // potong kuota kafe
      await tx`UPDATE cafes SET prepaid_token_balance = prepaid_token_balance - ${tokens} WHERE id = ${cafeId}`;
      await tx`
        INSERT INTO cafe_token_transactions (cafe_id, type, amount, balance_after, reference_type, reference_id, created_by_user_id)
        VALUES (${cafeId}, 'reserve', ${-tokens}, ${cafe[0].prepaid_token_balance - tokens}, 'receipt', ${rows[0].id}, ${auth.user.id})`;

      // update counter harian
      await tx`UPDATE users SET keys_issued_today = ${issuedToday + 1}, keys_issued_date = ${today}::date WHERE id = ${auth.user.id}`;

      return { full, row: rows[0], tokens, expiresAt, cafeId };
    });

    await logAudit(auth.user.id, "apikey.issue", "api_keys", result.row.id, { package_id: packageId, tokens, expires_days: expiresDays, cafe_id: result.cafeId });

    return NextResponse.json(
      { key: result.full, api_key: result.row },
      { status: 201 },
    );
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "Gagal menerbitkan key";
    if (msg === "INSUFFICIENT_CAFE_QUOTA") {
      return NextResponse.json({ error: { code: "INSUFFICIENT_CAFE_QUOTA", message: "Kuota token prepaid cafe tidak cukup." } }, { status: 402 });
    }
    if (msg === "KEY_ACTIVE_LIMIT") {
      return NextResponse.json({ error: { code: "KEY_ACTIVE_LIMIT", message: "Batas key aktif tercapai." } }, { status: 409 });
    }
    if (msg === "DAILY_ISSUE_LIMIT") {
      return NextResponse.json({ error: { code: "DAILY_ISSUE_LIMIT", message: "Batas penerbitan harian tercapai." } }, { status: 409 });
    }
    if (msg === "CAFE_NOT_FOUND" || msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Cafe / user tidak ditemukan." } }, { status: 404 });
    }
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { requirePermission } from '@/lib/permissions';
import { sql } from '@/lib/db';
import { logAudit } from '@/lib/permissions';
import { createHash, randomBytes } from 'node:crypto';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requirePermission(req, "token.topup");
  if (typeof auth === "string") {
    const status = auth === "unauthorized" ? 401 : 403;
    const message = auth === "forbidden-permission" ? "Akun ini tidak memiliki izin top-up." : "Akses tidak sah.";
    return NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status });
  }

  let body: { package_id?: unknown; quota_add?: unknown; expires_days_add?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const key = (await sql`
    SELECT id, cafe_id, created_by_user_id, token_quota, tokens_used, expires_at, revoked_at, is_active
    FROM api_keys WHERE id = ${id} LIMIT 1`) as unknown as Array<{
    id: string;
    cafe_id: string | null;
    created_by_user_id: string | null;
    token_quota: number;
    tokens_used: number;
    expires_at: string | null;
    revoked_at: string | null;
    is_active: boolean;
  }>;

  if (!key[0]) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "API key tidak ditemukan." } }, { status: 404 });
  }
  if (key[0].revoked_at) {
    return NextResponse.json({ error: { code: "KEY_REVOKED", message: "Key sudah di-revoke." } }, { status: 409 });
  }
  // kasir hanya boleh topup key miliknya
  if (auth.user.role === "kasir" && key[0].created_by_user_id !== auth.user.id) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Bukan key milik Anda." } }, { status: 403 });
  }

  const cafeId = key[0].cafe_id;
  if (!cafeId) {
    return NextResponse.json({ error: { code: "NO_CAFE", message: "Key tidak terikat cafe." } }, { status: 400 });
  }

  // tentukan tambahan kuota
  let quotaAdd = 0;
  let expiresDaysAdd = 0;
  if (typeof body.package_id === "string" && body.package_id.trim()) {
    const pkg = (await sql`
      SELECT tokens_granted, default_expires_days, max_expires_days, is_active
      FROM token_packages WHERE id = ${body.package_id.trim()} LIMIT 1`) as unknown as Array<{
      tokens_granted: number;
      default_expires_days: number;
      max_expires_days: number;
      is_active: boolean;
    }>;
    if (!pkg[0] || !pkg[0].is_active) {
      return NextResponse.json({ error: { code: "PACKAGE_NOT_FOUND", message: "Paket tidak ditemukan." } }, { status: 404 });
    }
    quotaAdd = pkg[0].tokens_granted;
    expiresDaysAdd = pkg[0].default_expires_days;
  } else {
    quotaAdd = typeof body.quota_add === "number" && body.quota_add > 0 ? Math.trunc(body.quota_add) : 0;
    expiresDaysAdd = typeof body.expires_days_add === "number" && body.expires_days_add > 0 ? body.expires_days_add : 0;
  }
  if (quotaAdd <= 0) {
    return NextResponse.json({ error: { code: "INVALID_QUOTA", message: "quota_add / package_id wajib." } }, { status: 400 });
  }

  try {
    const result = await sql.begin(async (tx: any) => {
      const cafe = (await tx`SELECT id, prepaid_token_balance, is_active FROM cafes WHERE id = ${cafeId} FOR UPDATE`) as unknown as Array<{ id: string; prepaid_token_balance: number; is_active: boolean }>;
      if (!cafe[0] || !cafe[0].is_active) throw new Error("CAFE_NOT_FOUND");
      if (cafe[0].prepaid_token_balance < quotaAdd) throw new Error("INSUFFICIENT_CAFE_QUOTA");

      const newQuota = key[0].token_quota + quotaAdd;
      const baseExpiry = key[0].expires_at ? new Date(key[0].expires_at) : new Date();
      const now = new Date();
      const start = baseExpiry > now ? baseExpiry : now;
      const newExpiry = expiresDaysAdd > 0
        ? new Date(start.getTime() + expiresDaysAdd * 24 * 60 * 60 * 1000).toISOString()
        : key[0].expires_at;

      await tx`UPDATE cafes SET prepaid_token_balance = prepaid_token_balance - ${quotaAdd} WHERE id = ${cafeId}`;
      await tx`
        INSERT INTO cafe_token_transactions (cafe_id, type, amount, balance_after, reference_type, reference_id, created_by_user_id)
        VALUES (${cafeId}, 'reserve', ${-quotaAdd}, ${cafe[0].prepaid_token_balance - quotaAdd}, 'apikey', ${id}, ${auth.user.id})`;
      await tx`
        UPDATE api_keys SET token_quota = ${newQuota}, expires_at = ${newExpiry}, is_active = TRUE
        WHERE id = ${id}`;

      return { newQuota, newExpiry };
    });

    await logAudit(auth.user.id, "apikey.topup", "api_keys", id, { quota_add: quotaAdd, expires_days_add: expiresDaysAdd });

    return NextResponse.json({ success: true, token_quota: result.newQuota, expires_at: result.newExpiry });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : "Gagal top-up";
    if (msg === "INSUFFICIENT_CAFE_QUOTA") {
      return NextResponse.json({ error: { code: "INSUFFICIENT_CAFE_QUOTA", message: "Kuota cafe tidak cukup." } }, { status: 402 });
    }
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: 500 });
  }
}
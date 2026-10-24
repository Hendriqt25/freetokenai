import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { createHash } from 'node:crypto';

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { roles: ['kasir', 'super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Akses tidak sah.' } }, { status });
  }

  const { searchParams } = new URL(req.url);
  const fullKey = searchParams.get('key')?.trim() ?? '';
  const prefix = searchParams.get('prefix')?.trim() ?? '';

  if (!fullKey && !prefix) {
    return NextResponse.json({ error: { code: 'MISSING_KEY', message: 'key atau prefix wajib.' } }, { status: 400 });
  }

  try {
    let rows: any[] = [];
    if (fullKey) {
      const hash = createHash('sha256').update(fullKey).digest('hex');
      rows = (await sql`
        SELECT k.id, k.key_prefix, k.name, k.is_active, k.token_quota, k.tokens_used, k.expires_at, k.revoked_at, k.revoked_reason, k.cafe_id, c.name AS cafe_name
        FROM api_keys k LEFT JOIN cafes c ON c.id = k.cafe_id
        WHERE k.key_hash = ${hash} LIMIT 1`) as any[];
    } else {
      rows = (await sql`
        SELECT k.id, k.key_prefix, k.name, k.is_active, k.token_quota, k.tokens_used, k.expires_at, k.revoked_at, k.revoked_reason, k.cafe_id, c.name AS cafe_name
        FROM api_keys k LEFT JOIN cafes c ON c.id = k.cafe_id
        WHERE k.key_prefix = ${prefix} LIMIT 1`) as any[];
    }

    if (!rows[0]) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'API key tidak ditemukan.' } }, { status: 404 });
    }
    const r = rows[0];
    const remaining = Math.max(0, (r.token_quota ?? 0) - (r.tokens_used ?? 0));
    const now = Date.now();
    let status = 'active';
    if (r.revoked_at) status = 'revoked';
    else if (r.expires_at && new Date(r.expires_at).getTime() < now) status = 'expired';
    else if (remaining <= 0 && (r.token_quota ?? 0) > 0) status = 'exhausted';
    else if (r.token_quota > 0 && remaining / r.token_quota <= 0.2) status = 'expiring';
    if (!r.is_active && !r.revoked_at) status = 'disabled';

    return NextResponse.json({
      key: {
        id: r.id,
        prefix: r.key_prefix,
        name: r.name,
        status,
        remaining,
        token_quota: r.token_quota,
        tokens_used: r.tokens_used,
        expires_at: r.expires_at,
        revoked_at: r.revoked_at,
        revoked_reason: r.revoked_reason,
        cafe_name: r.cafe_name,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal.' } }, { status: 500 });
  }
}
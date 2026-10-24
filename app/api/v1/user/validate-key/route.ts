import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createHash } from 'node:crypto';
import { createSession, sessionCookieHeader } from '@/lib/auth';

export async function POST(req: Request) {
  let body: { apiKey?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const fullKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!fullKey || !fullKey.startsWith('rst_live_')) {
    return NextResponse.json({ error: { code: 'INVALID_KEY', message: 'Format API key tidak valid. Awalan harus rst_live_...' } }, { status: 400 });
  }

  try {
    const hash = createHash('sha256').update(fullKey).digest('hex');
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
        k.cafe_id,
        k.workspace_id,
        k.created_by_user_id
      FROM api_keys k
      WHERE k.key_hash = ${hash}
      LIMIT 1`) as unknown as Array<{
      id: string;
      key_prefix: string;
      name: string | null;
      is_active: boolean;
      token_quota: number;
      tokens_used: number;
      expires_at: string | null;
      revoked_at: string | null;
      revoked_reason: string | null;
      cafe_id: string | null;
      workspace_id: string | null;
      created_by_user_id: string;
    }>;

    if (!rows[0]) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'API key tidak ditemukan. Pastikan key sudah benar.' } }, { status: 404 });
    }

    const r = rows[0];
    const remaining = Math.max(0, (r.token_quota ?? 0) - (r.tokens_used ?? 0));
    const now = Date.now();
    let status = 'active';

    if (r.revoked_at) {
      status = 'revoked';
    } else if (r.expires_at && new Date(r.expires_at).getTime() < now) {
      status = 'expired';
    } else if (remaining <= 0 && (r.token_quota ?? 0) > 0) {
      status = 'exhausted';
    } else if (r.token_quota > 0 && remaining / r.token_quota <= 0.2) {
      status = 'expiring';
    }
    if (!r.is_active && !r.revoked_at) {
      status = 'disabled';
    }

    if (status === 'revoked' || status === 'disabled') {
      return NextResponse.json({
        error: { code: 'KEY_INACTIVE', message: `API key ini berstatus ${status}. Hubungi kasir.` },
        key: { status, remaining, expires_at: r.expires_at }
      }, { status: 403 });
    }

    if (status === 'expired') {
      return NextResponse.json({
        error: { code: 'KEY_EXPIRED', message: 'Masa aktif API key ini telah habis (expired). Silakan perpanjang di kasir.' },
        key: { status, remaining, expires_at: r.expires_at }
      }, { status: 403 });
    }

    if (status === 'exhausted') {
      return NextResponse.json({
        error: { code: 'KEY_EXHAUSTED', message: 'Saldo token API key ini telah habis (0 token). Silakan topup di kasir.' },
        key: { status, remaining, expires_at: r.expires_at }
      }, { status: 403 });
    }

    let customerUserId: string;
    let workspaceId: string;
    let workspaceBalance = remaining;
    let workspaceExpiresAt = r.expires_at;

    if (r.workspace_id) {
      // API key sudah punya workspace terikat
      const wsRows = (await sql`
        SELECT id, user_id, token_balance, expires_at
        FROM workspaces
        WHERE id = ${r.workspace_id}
        LIMIT 1`) as unknown as Array<{
        id: string;
        user_id: string;
        token_balance: number;
        expires_at: string;
      }>;

      if (wsRows[0]) {
        customerUserId = wsRows[0].user_id;
        workspaceId = wsRows[0].id;
        // Sinkronisasi saldo jika kasir baru topup key
        if (wsRows[0].token_balance < remaining) {
          await sql`
            UPDATE workspaces
            SET token_balance = ${remaining}, expires_at = ${r.expires_at}
            WHERE id = ${workspaceId}`;
          workspaceBalance = remaining;
        } else {
          workspaceBalance = wsRows[0].token_balance;
        }
        workspaceExpiresAt = wsRows[0].expires_at || r.expires_at;
      } else {
        // Fallback jika baris workspace terhapus
        customerUserId = await createCustomerUser(r);
        const newWs = await createCustomerWorkspace(customerUserId, remaining, r.expires_at, r.cafe_id);
        workspaceId = newWs.id;
        await sql`UPDATE api_keys SET workspace_id = ${workspaceId} WHERE id = ${r.id}`;
      }
    } else {
      // API key baru divalidasi pertama kali oleh customer
      customerUserId = await createCustomerUser(r);
      const newWs = await createCustomerWorkspace(customerUserId, remaining, r.expires_at, r.cafe_id);
      workspaceId = newWs.id;
      await sql`UPDATE api_keys SET workspace_id = ${workspaceId} WHERE id = ${r.id}`;
    }

    // Buat session customer dan pasang cookie ftai_session
    const userAgent = req.headers.get('user-agent') || 'user-browser';
    const session = await createSession(customerUserId, userAgent);

    const response = NextResponse.json({
      success: true,
      key: {
        id: r.id,
        prefix: r.key_prefix,
        name: r.name,
        status,
        remaining: workspaceBalance,
        token_quota: r.token_quota,
        tokens_used: r.tokens_used,
        expires_at: workspaceExpiresAt,
        cafe_id: r.cafe_id,
      },
      workspace: {
        id: workspaceId,
        token_balance: workspaceBalance,
        expires_at: workspaceExpiresAt,
      },
    }, { status: 200 });

    response.headers.set('Set-Cookie', sessionCookieHeader(session.id));
    return response;
  } catch (e) {
    return NextResponse.json({
      error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal memvalidasi API key.' }
    }, { status: 500 });
  }
}

async function createCustomerUser(key: { id: string; key_prefix: string; name: string | null; cafe_id: string | null }): Promise<string> {
  const syntheticEmail = `customer_${key.key_prefix.toLowerCase()}_${key.id.slice(0, 6)}@freetoken.local`;
  const customerName = key.name || `Tamu ${key.key_prefix}`;

  const rows = (await sql`
    INSERT INTO users (email, name, role, cafe_id)
    VALUES (${syntheticEmail}, ${customerName}, 'customer', ${key.cafe_id})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`) as unknown as Array<{ id: string }>;

  return rows[0].id;
}

async function createCustomerWorkspace(
  userId: string,
  balance: number,
  expiresAt: string | null,
  cafeId: string | null,
): Promise<{ id: string }> {
  const expiry = expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = (await sql`
    INSERT INTO workspaces (user_id, token_balance, expires_at, cafe_id)
    VALUES (${userId}, ${balance}, ${expiry}, ${cafeId})
    RETURNING id`) as unknown as Array<{ id: string }>;

  return rows[0];
}

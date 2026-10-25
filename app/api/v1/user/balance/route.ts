import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Belum login.' } },
      { status: 401 },
    );
  }

  try {
    const rows = (await sql`
      SELECT id, token_balance, expires_at, cafe_id
      FROM workspaces
      WHERE user_id = ${auth.user.id}
      ORDER BY created_at
    LIMIT 1`) as unknown as Array<{
      id: string;
      token_balance: number;
      expires_at: string | null;
      cafe_id: string | null;
    }>;

    if (!rows[0]) {
      return NextResponse.json({ error: { code: 'NO_WORKSPACE', message: 'Workspace tidak ditemukan.' } }, { status: 404 });
    }

    const ws = rows[0];
    const isExpired = ws.expires_at ? new Date(ws.expires_at).getTime() < Date.now() : false;
    const isExhausted = ws.token_balance <= 0;

    let cafeName: string | null = null;
    if (ws.cafe_id) {
      const cafeRows = (await sql`
        SELECT name FROM cafes WHERE id = ${ws.cafe_id} LIMIT 1`) as unknown as Array<{ name: string }>;
      cafeName = cafeRows[0]?.name ?? null;
    }

    return NextResponse.json({
      workspaceId: ws.id,
      remaining: ws.token_balance,
      expiresAt: ws.expires_at,
      isExpired,
      isExhausted,
      cafeName,
      user: { id: auth.user.id, name: auth.user.name },
    });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal load balance.' } },
      { status: 500 },
    );
  }
}
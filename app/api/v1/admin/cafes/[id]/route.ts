import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  const { id } = await params;

  try {
    const cafe = (await sql`
      SELECT
        c.id,
        c.name,
        COALESCE((SELECT SUM(amount) FROM cafe_token_transactions WHERE cafe_id = c.id AND type = 'topup'), c.prepaid_token_balance)::int AS prepaid_quota,
        c.prepaid_token_balance AS token_balance,
        (SELECT MAX(expires_at) FROM workspaces WHERE cafe_id = c.id) AS expires_at
      FROM cafes c WHERE c.id = ${id} LIMIT 1`) as unknown as {
      id: string; name: string; prepaid_quota: number; token_balance: number; expires_at: string | null;
    }[];

    if (!cafe[0]) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Cafe tidak ditemukan' } }, { status: 404 });

    const workspaces = (await sql`
      SELECT w.id, COALESCE(u.name, 'Workspace ' || left(w.id::text, 8)) AS name, w.token_balance, w.expires_at
      FROM workspaces w LEFT JOIN users u ON u.id = w.user_id
      WHERE w.cafe_id = ${id} ORDER BY w.created_at`) as unknown as {
      id: string; name: string; token_balance: number; expires_at: string | null;
    }[];

    const wsIds = workspaces.map(w => w.id);

    let usageByEndpoint: { endpoint_type: string; tokens_burned: number; count: number }[] = [];
    let usageByDay: { day: string; tokens_burned: number; count: number }[] = [];

    if (wsIds.length > 0) {
      usageByEndpoint = (await sql`
        SELECT endpoint_type, SUM(tokens_burned) as tokens_burned, COUNT(*) as count
        FROM usage_logs
        WHERE workspace_id = ANY(${wsIds}) AND status = 'success'
        GROUP BY endpoint_type
        ORDER BY tokens_burned DESC`) as unknown as { endpoint_type: string; tokens_burned: number; count: number }[];

      usageByDay = (await sql`
        SELECT DATE(created_at) as day, SUM(tokens_burned) as tokens_burned, COUNT(*) as count
        FROM usage_logs
        WHERE workspace_id = ANY(${wsIds}) AND status = 'success'
        GROUP BY DATE(created_at)
        ORDER BY day DESC
        LIMIT 30`) as unknown as { day: string; tokens_burned: number; count: number }[];
    }

    return NextResponse.json({
      cafe: cafe[0],
      workspaces,
      usage: { byEndpoint: usageByEndpoint, byDay: usageByDay },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Gagal memuat detail cafe' } }, { status: 500 });
  }
}
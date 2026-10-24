import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  try {
    const cafes = (await sql`
      SELECT
        c.id,
        c.name,
        c.is_active,
        c.prepaid_token_balance::int AS token_balance,
        COALESCE((SELECT SUM(amount) FROM cafe_token_transactions WHERE cafe_id = c.id AND amount > 0), 0)::int AS total_topup,
        COALESCE((SELECT SUM(-amount) FROM cafe_token_transactions WHERE cafe_id = c.id AND amount < 0), 0)::int AS total_used,
        (SELECT MAX(created_at) FROM cafe_token_transactions WHERE cafe_id = c.id) AS last_activity_at,
        (SELECT MAX(expires_at) FROM workspaces WHERE cafe_id = c.id) AS expires_at,
        (SELECT COUNT(*)::int FROM workspaces WHERE cafe_id = c.id AND expires_at > now()) AS active_workspaces,
        (SELECT COUNT(*)::int FROM api_keys WHERE cafe_id = c.id AND is_active AND revoked_at IS NULL) AS active_keys
      FROM cafes c
      ORDER BY c.created_at DESC`) as unknown as {
      id: string; name: string; is_active: boolean; token_balance: number; total_topup: number;
      total_used: number; last_activity_at: string | null; expires_at: string | null;
      active_workspaces: number; active_keys: number;
    }[];

    return NextResponse.json({ cafes });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Gagal memuat cafe' } }, { status: 500 });
  }
}
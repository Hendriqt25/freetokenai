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
        COALESCE((SELECT SUM(amount) FROM cafe_token_transactions WHERE cafe_id = c.id AND type = 'topup'), c.prepaid_token_balance)::int AS prepaid_quota,
        c.prepaid_token_balance AS token_balance,
        (SELECT MAX(expires_at) FROM workspaces WHERE cafe_id = c.id) AS expires_at,
        (SELECT COUNT(*)::int FROM workspaces WHERE cafe_id = c.id AND expires_at > now()) AS active_workspaces,
        COALESCE((SELECT SUM(tt.amount) FROM token_transactions tt JOIN workspaces w ON w.id = tt.workspace_id WHERE w.cafe_id = c.id AND tt.type = 'grant'), 0)::int AS total_granted
      FROM cafes c
      ORDER BY c.created_at DESC`) as unknown as {
      id: string; name: string; prepaid_quota: number; token_balance: number; expires_at: string | null;
      active_workspaces: number; total_granted: number;
    }[];

    return NextResponse.json({ cafes });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Gagal memuat cafe' } }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  const { searchParams } = new URL(req.url);
  const kasirId = searchParams.get('kasir_id')?.trim() ?? '';
  const typeFilter = searchParams.get('type')?.trim() ?? '';
  const days = Math.min(Math.max(Number(searchParams.get('days') ?? 30), 1), 90);

  try {
    const rows = (await sql`
      SELECT
        t.id,
        t.cafe_id,
        c.name AS cafe_name,
        t.type,
        t.amount,
        t.balance_after,
        t.reference_type,
        t.reference_id,
        t.created_at,
        t.created_by_user_id,
        t.note,
        u.name AS kasir_name,
        u.email AS kasir_email,
        r.code AS receipt_code,
        r.tokens_granted AS receipt_tokens
      FROM cafe_token_transactions t
      LEFT JOIN cafes c ON c.id = t.cafe_id
      LEFT JOIN users u ON u.id = t.created_by_user_id
      LEFT JOIN receipts r ON r.id = t.reference_id AND t.reference_type = 'receipt'
      WHERE t.created_at >= now() - (${days} || ' days')::interval
        AND (${kasirId ? sql`t.created_by_user_id = ${kasirId}` : sql`TRUE`})
        AND (${typeFilter ? sql`t.type = ${typeFilter}` : sql`TRUE`})
      ORDER BY t.created_at DESC
      LIMIT 300`) as unknown as Array<{
      id: string;
      cafe_id: string | null;
      cafe_name: string | null;
      type: string;
      amount: number;
      balance_after: number;
      reference_type: string | null;
      reference_id: string | null;
      created_at: string;
      created_by_user_id: string | null;
      note: string | null;
      kasir_name: string | null;
      kasir_email: string | null;
      receipt_code: string | null;
      receipt_tokens: number | null;
    }>;

    return NextResponse.json({ transactions: rows });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal memuat' } },
      { status: 500 },
    );
  }
}
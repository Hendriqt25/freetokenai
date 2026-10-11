import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (!auth) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Belum login.' } }, { status: 401 });

  const { id } = await params;

  let body: { rating: number; feedback?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const rating = Number(body.rating);
  const feedback = body.feedback ? String(body.feedback).slice(0, 2000) : null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: { code: 'INVALID_RATING', message: 'Rating harus integer 1-5.' } }, { status: 400 });
  }

  try {
    // Verify usage_log belongs to user's workspace
    const usageLog = (await sql`
      SELECT ul.id, ul.workspace_id, w.user_id
      FROM usage_logs ul
      JOIN workspaces w ON w.id = ul.workspace_id
      WHERE ul.id = ${id} LIMIT 1`) as unknown as { id: string; workspace_id: string; user_id: string }[];

    if (!usageLog[0] || usageLog[0].user_id !== auth.user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Tidak memiliki akses ke usage log ini.' } }, { status: 403 });
    }

    // Upsert rating (idempoten per usage_log)
    await sql`
      INSERT INTO ratings (usage_log_id, rating, feedback)
      VALUES (${id}, ${rating}, ${feedback})
      ON CONFLICT (usage_log_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        feedback = EXCLUDED.feedback,
        updated_at = now()`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'Gagal menyimpan rating' } }, { status: 500 });
  }
}
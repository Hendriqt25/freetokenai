import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { logAudit } from '@/lib/permissions';

function slugify(input: string) {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'cafe'
  );
}

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

// Input manual di form Tambah Kasir: buat cafe baru lalu pakai id-nya.
export async function POST(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  let body: { name?: unknown; slug?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 150) {
    return NextResponse.json(
      { error: { code: 'INVALID_NAME', message: 'Nama cafe wajib 2–150 karakter.' } },
      { status: 400 },
    );
  }

  const customSlug = typeof body.slug === 'string' ? slugify(body.slug.trim()) : '';
  const base = customSlug || slugify(name);

  try {
    let slug = base;
    for (let i = 0; i < 5; i += 1) {
      const taken = (await sql`SELECT 1 FROM cafes WHERE slug = ${slug} LIMIT 1`) as unknown as unknown[];
      if (taken.length === 0) break;
      slug = `${base.slice(0, 30)}-${randomBytes(2).toString('hex')}`;
    }

    const rows = (await sql`
      INSERT INTO cafes (slug, name, prepaid_token_balance, is_active)
      VALUES (${slug}, ${name}, 0, TRUE)
      RETURNING id, slug, name, is_active, prepaid_token_balance::int AS token_balance`) as unknown as Array<{
      id: string;
      slug: string;
      name: string;
      is_active: boolean;
      token_balance: number;
    }>;

    await logAudit(auth.user.id, 'cafe.create', 'cafes', rows[0].id, { name, slug });

    return NextResponse.json({ cafe: rows[0] }, { status: 201 });
  } catch (e: any) {
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_SLUG', message: 'Slug cafe sudah dipakai.' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal membuat cafe' } },
      { status: 500 },
    );
  }
}
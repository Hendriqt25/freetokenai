import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin, hashPassword } from '@/lib/auth';
import { isPermissionKey, logAudit } from '@/lib/permissions';

function normalizePermissions(input: unknown): Array<{ key: string; allowed: boolean }> {
  if (!input || typeof input !== 'object') return [];
  return Object.entries(input as Record<string, unknown>)
    .filter(([key, value]) => isPermissionKey(key) && typeof value === 'boolean')
    .map(([key, allowed]) => ({ key, allowed: allowed as boolean }));
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  const { searchParams } = new URL(req.url);
  const roleFilter = searchParams.get('role');
  const search = searchParams.get('q')?.trim() ?? '';

  try {
    const users = (await sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone_number,
        u.role,
        u.cafe_id,
        c.name AS cafe_name,
        u.created_at,
        u.is_active,
        u.max_active_keys,
        u.daily_issue_limit,
        u.keys_issued_today,
        (SELECT w.token_balance FROM workspaces w
          WHERE w.user_id = u.id ORDER BY w.created_at LIMIT 1) AS token_balance,
        COALESCE(
          (SELECT up.allowed FROM user_permissions up
            WHERE up.user_id = u.id AND up.permission_key = 'apikey.issue'),
          (SELECT rp.allowed FROM role_permissions rp
            WHERE rp.role = u.role AND rp.permission_key = 'apikey.issue'),
          FALSE
        ) AS can_issue_api_keys,
        (u.admin_password_hash IS NOT NULL) AS has_password
      FROM users u
      LEFT JOIN cafes c ON c.id = u.cafe_id
      WHERE
        (${roleFilter ? sql`u.role = ${roleFilter}` : sql`TRUE`})
        AND (
          ${search ? sql`(
            u.name ILIKE ${'%' + search + '%'} OR
            u.email ILIKE ${'%' + search + '%'} OR
            u.phone_number ILIKE ${'%' + search + '%'}
          )` : sql`TRUE`}
        )
      ORDER BY u.created_at DESC
      LIMIT 100`) as unknown as Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone_number: string | null;
      role: 'customer' | 'kasir' | 'super_admin';
      cafe_id: string | null;
      cafe_name: string | null;
      created_at: string;
      is_active: boolean;
      max_active_keys: number;
      daily_issue_limit: number;
      keys_issued_today: number;
      token_balance: number | null;
      can_issue_api_keys: boolean;
      has_password: boolean;
    }>;

    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal memuat pengguna' } },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  let body: {
    name?: unknown;
    email?: unknown;
    phone_number?: unknown;
    role?: unknown;
    cafe_id?: unknown;
    password?: unknown;
    max_active_keys?: unknown;
    daily_issue_limit?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const phoneNumber = typeof body.phone_number === 'string' && body.phone_number.trim() ? body.phone_number.trim() : null;
  const role = body.role === 'super_admin' || body.role === 'kasir' || body.role === 'customer' ? body.role : 'kasir';
  const cafeId = typeof body.cafe_id === 'string' && body.cafe_id.trim() ? body.cafe_id.trim() : null;
  const password = typeof body.password === 'string' ? body.password : '';
  const maxActiveKeys = typeof body.max_active_keys === 'number' && body.max_active_keys >= 0 ? body.max_active_keys : 20;
  const dailyIssueLimit = typeof body.daily_issue_limit === 'number' && body.daily_issue_limit >= 0 ? body.daily_issue_limit : 50;

  if (!email && !phoneNumber) {
    return NextResponse.json(
      { error: { code: 'INVALID_IDENTIFIER', message: 'Email atau nomor HP wajib diisi.' } },
      { status: 400 },
    );
  }

  if (role === 'kasir' && !cafeId) {
    return NextResponse.json(
      { error: { code: 'CAFE_REQUIRED', message: 'Role kasir wajib terhubung dengan cafe.' } },
      { status: 400 },
    );
  }

  if ((role === 'kasir' || role === 'super_admin') && (!password || password.length < 8)) {
    return NextResponse.json(
      { error: { code: 'PASSWORD_TOO_SHORT', message: 'Password untuk admin/kasir minimal 8 karakter.' } },
      { status: 400 },
    );
  }

  let passwordHash: string | null = null;
  if (password) {
    try {
      passwordHash = hashPassword(password);
    } catch (e) {
      return NextResponse.json(
        { error: { code: 'INVALID_PASSWORD', message: e instanceof Error ? e.message : 'Password tidak valid.' } },
        { status: 400 },
      );
    }
  }

  try {
    const rows = (await sql`
      INSERT INTO users (name, email, phone_number, role, cafe_id, admin_password_hash, max_active_keys, daily_issue_limit)
      VALUES (${name}, ${email}, ${phoneNumber}, ${role}, ${role === 'kasir' ? cafeId : null}, ${passwordHash}, ${maxActiveKeys}, ${dailyIssueLimit})
      RETURNING id, name, email, phone_number, role, cafe_id, created_at`) as unknown as Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone_number: string | null;
      role: string;
      cafe_id: string | null;
      created_at: string;
    }>;

    await logAudit(auth.user.id, 'user.create', 'users', rows[0].id, { role });

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (e: any) {
    if (e.code === '23505') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_USER', message: 'Email atau nomor telepon sudah terdaftar.' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal membuat pengguna' } },
      { status: 500 },
    );
  }
}
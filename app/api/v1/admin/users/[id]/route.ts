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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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
    is_active?: unknown;
    max_active_keys?: unknown;
    daily_issue_limit?: unknown;
    permissions?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const existing = (await sql`
    SELECT id, role, cafe_id, is_active FROM users WHERE id = ${id} LIMIT 1
  `) as unknown as Array<{ id: string; role: string; cafe_id: string | null; is_active: boolean }>;

  if (!existing[0]) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan.' } }, { status: 404 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : undefined;
  const phoneNumber = typeof body.phone_number === 'string' && body.phone_number.trim() ? body.phone_number.trim() : undefined;
  const role = body.role === 'super_admin' || body.role === 'kasir' || body.role === 'customer' ? body.role : undefined;
  const cafeId = body.cafe_id === null ? null : typeof body.cafe_id === 'string' && body.cafe_id.trim() ? body.cafe_id.trim() : undefined;
  const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : undefined;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;
  const maxActiveKeys = typeof body.max_active_keys === 'number' && body.max_active_keys >= 0 ? body.max_active_keys : undefined;
  const dailyIssueLimit = typeof body.daily_issue_limit === 'number' && body.daily_issue_limit >= 0 ? body.daily_issue_limit : undefined;
  const permissions = normalizePermissions(body.permissions);

  let passwordHash: string | undefined = undefined;
  if (password !== undefined) {
    if (password.length < 8) {
      return NextResponse.json(
        { error: { code: 'PASSWORD_TOO_SHORT', message: 'Password minimal 8 karakter.' } },
        { status: 400 },
      );
    }
    try {
      passwordHash = hashPassword(password);
    } catch (e) {
      return NextResponse.json(
        { error: { code: 'INVALID_PASSWORD', message: e instanceof Error ? e.message : 'Password tidak valid.' } },
        { status: 400 },
      );
    }
  }

  // Validasi role kasir wajib punya cafe_id
  if (role === 'kasir' && cafeId === null && cafeId !== undefined) {
    return NextResponse.json(
      { error: { code: 'CAFE_REQUIRED', message: 'Role kasir wajib terhubung dengan cafe.' } },
      { status: 400 },
    );
  }

  try {
    const updated = (await sql`
      UPDATE users SET
        name = COALESCE(${name ?? null}, name),
        email = COALESCE(${email ?? null}, email),
        phone_number = COALESCE(${phoneNumber ?? null}, phone_number),
        role = COALESCE(${role ?? null}, role),
        cafe_id = ${cafeId !== undefined ? cafeId : sql`cafe_id`},
        is_active = COALESCE(${isActive ?? null}, is_active),
        max_active_keys = COALESCE(${maxActiveKeys ?? null}, max_active_keys),
        daily_issue_limit = COALESCE(${dailyIssueLimit ?? null}, daily_issue_limit),
        admin_password_hash = COALESCE(${passwordHash ?? null}, admin_password_hash)
      WHERE id = ${id}
      RETURNING id, name, email, phone_number, role, cafe_id, created_at, is_active, max_active_keys, daily_issue_limit, (admin_password_hash IS NOT NULL) AS has_password
    `) as unknown as Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone_number: string | null;
      role: string;
      cafe_id: string | null;
      created_at: string;
      is_active: boolean;
      max_active_keys: number;
      daily_issue_limit: number;
      has_password: boolean;
    }>;

    // Update permissions override if provided
    if (permissions.length > 0) {
      await sql.begin(async (tx: any) => {
        for (const p of permissions) {
          await tx`
            INSERT INTO user_permissions (user_id, permission_key, allowed, updated_at)
            VALUES (${id}, ${p.key}, ${p.allowed}, now())
            ON CONFLICT (user_id, permission_key)
            DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`;
        }
      });
      await logAudit(auth.user.id, 'user.permissions_update', 'user_permissions', id, { permissions });
    }

    await logAudit(auth.user.id, 'user.update', 'users', id, { role, is_active: isActive });

    return NextResponse.json({ user: updated[0] });
  } catch (e: any) {
    if (e.code === '23505') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_USER', message: 'Email atau nomor telepon sudah terdaftar.' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal memperbarui pengguna.' } },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  if (auth.user.id === id) {
    return NextResponse.json(
      { error: { code: 'CANNOT_DELETE_SELF', message: 'Anda tidak dapat menghapus akun Anda sendiri.' } },
      { status: 400 },
    );
  }

  try {
    await sql.begin(async (tx: any) => {
      // Lepas relasi receipts yang dibuat oleh user ini sebelum dihapus
      await tx`UPDATE receipts SET created_by_user_id = NULL WHERE created_by_user_id = ${id}`;
      await tx`UPDATE cafe_token_transactions SET created_by_user_id = NULL WHERE created_by_user_id = ${id}`;
      await tx`DELETE FROM user_permissions WHERE user_id = ${id}`;
      await tx`DELETE FROM users WHERE id = ${id}`;
    });

    await logAudit(auth.user.id, 'user.delete', 'users', id, {});

    return NextResponse.json({ success: true, message: 'Pengguna berhasil dihapus.' });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal menghapus pengguna.' } },
      { status: 500 },
    );
  }
}
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  PROTECTED_PERMISSIONS,
  isAssignableRole,
  isPermissionKey,
  isProtected,
  rolePermissionMap,
  logAudit,
} from '@/lib/permissions';
import { sql } from '@/lib/db';

type RoleMatrix = Record<string, Record<string, boolean>>;

async function matrix(): Promise<RoleMatrix> {
  const out: RoleMatrix = {};
  for (const role of ASSIGNABLE_ROLES) {
    out[role] = await rolePermissionMap(role);
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } },
      { status },
    );
  }

  return NextResponse.json({
    catalog: PERMISSIONS,
    roles: await matrix(),
    protected: PROTECTED_PERMISSIONS,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } },
      { status },
    );
  }

  let body: { changes?: unknown; role?: unknown; permission_key?: unknown; allowed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } },
      { status: 400 },
    );
  }

  const rawChanges = Array.isArray(body.changes)
    ? body.changes
    : [{ role: body.role, permission_key: body.permission_key, allowed: body.allowed }];

  if (!rawChanges.length) {
    return NextResponse.json(
      { error: { code: 'NO_CHANGES', message: 'Tidak ada perubahan yang dikirim.' } },
      { status: 400 },
    );
  }

  const changes: Array<{ role: string; permission_key: string; allowed: boolean }> = [];
  for (const item of rawChanges) {
    const c = item as { role?: unknown; permission_key?: unknown; allowed?: unknown };
    if (!isAssignableRole(c.role))
      return NextResponse.json(
        { error: { code: 'INVALID_ROLE', message: 'Role tidak dikenal.' } },
        { status: 400 },
      );
    if (!isPermissionKey(c.permission_key))
      return NextResponse.json(
        { error: { code: 'INVALID_PERMISSION', message: 'Permission tidak dikenal.' } },
        { status: 400 },
      );
    if (typeof c.allowed !== 'boolean')
      return NextResponse.json(
        { error: { code: 'INVALID_ALLOWED', message: 'allowed harus boolean.' } },
        { status: 400 },
      );
    if (!c.allowed && isProtected(c.role, c.permission_key))
      return NextResponse.json(
        {
          error: {
            code: 'PROTECTED_PERMISSION',
            message: `${c.permission_key} tidak boleh dicabut dari ${c.role} (anti-lockout).`,
          },
        },
        { status: 409 },
      );
    changes.push({ role: c.role, permission_key: c.permission_key, allowed: c.allowed });
  }

  try {
    await sql.begin(async (tx: any) => {
      for (const c of changes) {
        await tx`
          INSERT INTO role_permissions (role, permission_key, allowed, updated_at)
          VALUES (${c.role}, ${c.permission_key}, ${c.allowed}, now())
          ON CONFLICT (role, permission_key)
          DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`;
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal menyimpan.' } },
      { status: 500 },
    );
  }

  await logAudit(auth.user.id, 'rbac.update', 'role_permissions', null, { changes });

  return NextResponse.json({ ok: true, roles: await matrix() });
}

// Katalog permission + resolusi izin efektif (role default + override per akun).
// Matriks di /admin/rbac menulis ke role_permissions; toggle per kasir di
// /admin/users menulis ke user_permissions.
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export type PermissionKey =
  | 'kasir.crud'
  | 'apikey.list'
  | 'apikey.revoke'
  | 'package.manage'
  | 'apikey.issue'
  | 'token.topup'
  | 'tx.view_own'
  | 'apikey.input'
  | 'ai.access';

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
};

export const PERMISSIONS: PermissionDef[] = [
  { key: 'kasir.crud', label: 'Kelola Akun Kasir (CRUD)', description: 'Membuat, mengubah, menonaktifkan, dan menghapus akun kasir.' },
  { key: 'apikey.list', label: 'Lihat List Semua API Key', description: 'Melihat seluruh API key lintas kasir & cafe.' },
  { key: 'apikey.revoke', label: 'Revoke / Memblokir API Key', description: 'Mencabut API key yang disalahgunakan.' },
  { key: 'package.manage', label: 'Atur Master Paket Kuota', description: 'Membuat dan mengubah paket token beserta masa berlakunya.' },
  { key: 'apikey.issue', label: 'Generate / Issuing API Key', description: 'Menerbitkan API key baru untuk pembeli.' },
  { key: 'token.topup', label: 'Top-Up Kuota Token', description: 'Menambah kuota token pada API key yang sudah ada.' },
  { key: 'tx.view_own', label: 'Lihat Riwayat Transaksi Sendiri', description: 'Melihat transaksi & API key yang dibuat akun sendiri.' },
  { key: 'apikey.input', label: 'Input API Key via Pop-up', description: 'Memasukkan API key untuk membuka akses fitur AI.' },
  { key: 'ai.access', label: 'Akses Fitur AI (Chat, Video, Doc)', description: 'Memakai chat, dokumen, dan generate video.' },
];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const ASSIGNABLE_ROLES = ['super_admin', 'kasir', 'customer'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABEL: Record<AssignableRole, string> = {
  super_admin: 'Admin',
  kasir: 'Kasir',
  customer: 'User',
};

// Izin yang tidak boleh dicabut dari super_admin agar admin tidak mengunci diri sendiri.
export const PROTECTED_PERMISSIONS: Partial<Record<AssignableRole, PermissionKey[]>> = {
  super_admin: ['kasir.crud'],
};

export function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && (PERMISSION_KEYS as string[]).includes(value);
}

export function isProtected(role: AssignableRole, key: PermissionKey): boolean {
  return PROTECTED_PERMISSIONS[role]?.includes(key) ?? false;
}

function emptyMap(): Record<PermissionKey, boolean> {
  const out = {} as Record<PermissionKey, boolean>;
  for (const key of PERMISSION_KEYS) out[key] = false;
  return out;
}

export async function rolePermissionMap(role: AssignableRole): Promise<Record<PermissionKey, boolean>> {
  const rows = (await sql`
    SELECT permission_key, allowed FROM role_permissions WHERE role = ${role}`) as unknown as Array<{
    permission_key: PermissionKey;
    allowed: boolean;
  }>;

  const map = emptyMap();
  for (const row of rows) {
    if (isPermissionKey(row.permission_key)) map[row.permission_key] = row.allowed;
  }
  for (const key of PROTECTED_PERMISSIONS[role] ?? []) map[key] = true;
  return map;
}

export async function effectivePermissions(
  userId: string,
  role: string,
): Promise<Record<PermissionKey, boolean>> {
  const base = isAssignableRole(role)
    ? await rolePermissionMap(role)
    : emptyMap();

  const overrides = (await sql`
    SELECT permission_key, allowed FROM user_permissions WHERE user_id = ${userId}`) as unknown as Array<{
    permission_key: PermissionKey;
    allowed: boolean;
  }>;

  for (const row of overrides) {
    if (isPermissionKey(row.permission_key)) base[row.permission_key] = row.allowed;
  }
  return base;
}

export async function hasPermission(userId: string, role: string, key: PermissionKey): Promise<boolean> {
  const map = await effectivePermissions(userId, role);
  return map[key] === true;
}

export type PermissionAuth =
  | { user: { id: string; role: string; cafe_id: string | null }; sessionId: string }
  | 'unauthorized'
  | 'forbidden-origin'
  | 'forbidden-role'
  | 'forbidden-cafe'
  | 'forbidden-permission';

// Guard endpoint admin berbasis permission. Bearer JWT & cookie console didukung
// lewat requireAdmin, lalu dicek izin efektif akun tersebut.
export async function requirePermission(
  req: Request,
  permission: PermissionKey,
  opts: { cafeId?: string } = {},
): Promise<PermissionAuth> {
  const auth = await requireAdmin(req, opts.cafeId ? { cafeId: opts.cafeId } : {});
  if (typeof auth === 'string') return auth;

  const allowed = await hasPermission(auth.user.id, auth.user.role, permission);
  if (!allowed) return 'forbidden-permission';
  return auth;
}

export function permissionDenied(auth: Exclude<PermissionAuth, { user: unknown }>) {
  const status =
    auth === 'unauthorized' ? 401 : auth === 'forbidden-origin' ? 403 : auth === 'forbidden-role' ? 403 : auth === 'forbidden-cafe' ? 403 : 403;
  const message =
    auth === 'forbidden-permission'
      ? 'Akun ini tidak memiliki izin untuk aksi tersebut.'
      : 'Akses admin tidak sah.';
  return { status, message };
}

// Audit ringan: dipakai untuk perubahan permission, limit, revoke API key.
export async function logAudit(
  actorUserId: string | null,
  action: string,
  targetType: string | null,
  targetId: string | null,
  detail: Record<string, unknown> = {},
) {
  try {
    await sql`
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, detail)
      VALUES (${actorUserId}, ${action}, ${targetType}, ${targetId}, ${JSON.stringify(detail)}::jsonb)`;
  } catch {
    // Audit tidak boleh menggagalkan aksi utama.
  }
}

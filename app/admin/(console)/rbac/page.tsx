'use client';

import { useEffect, useState } from 'react';
import { Check, Lock, ShieldCheck } from 'lucide-react';
import { Alert, Badge, Loading, PageHeader } from '@/components/admin/ui';

type PermissionDef = { key: string; label: string; description: string };
type Role = 'super_admin' | 'kasir' | 'customer';

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Admin',
  kasir: 'Kasir',
  customer: 'User',
};

const ROLES: Role[] = ['super_admin', 'kasir', 'customer'];

export default function AdminRbacPage() {
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [roles, setRoles] = useState<Record<Role, Record<string, boolean>> | null>(null);
  const [protectedMap, setProtectedMap] = useState<Partial<Record<Role, string[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/rbac', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal memuat');
      setCatalog(data.catalog);
      setRoles(data.roles);
      setProtectedMap(data.protected ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(role: Role, key: string, next: boolean) {
    setSavingKey(`${role}:${key}`);
    setError('');
    try {
      const res = await fetch('/api/v1/admin/rbac', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ changes: [{ role, permission_key: key, allowed: next }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menyimpan');
      setRoles(data.roles);
      showNotice('Permission diperbarui.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSavingKey(null);
    }
  }

  function showNotice(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  }

  const isProtected = (role: Role, key: string) => protectedMap[role]?.includes(key) ?? false;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Matriks Hak Akses (RBAC)"
        description="Centang / hapus centang untuk mengubah izin per role. Perubahan berlaku langsung."
        icon={<ShieldCheck size={22} className="text-primary" />}
      />

      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {error && <Alert onClose={() => setError('')}>{error}</Alert>}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
        {loading || !roles ? (
          <Loading label="Memuat matriks izin..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
                <tr>
                  <th className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 font-semibold dark:bg-neutral-900">Fitur / Akses</th>
                  {ROLES.map((r) => (
                    <th key={r} className="w-28 px-4 py-3 text-center font-semibold">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {catalog.map((p) => (
                  <tr key={p.key} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3.5 text-left font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.label}
                        <code className="text-[10px] font-normal text-neutral-400">{p.key}</code>
                      </div>
                      <div className="text-xs font-normal text-neutral-400">{p.description}</div>
                    </th>
                    {ROLES.map((r) => {
                      const protectedFlag = isProtected(r, p.key);
                      const checked = roles[r]?.[p.key] ?? false;
                      const saving = savingKey === `${r}:${p.key}`;
                      return (
                        <td key={r} className="px-4 py-3.5 text-center">
                          <label className="inline-flex flex-col items-center gap-1">
                            {protectedFlag ? (
                              <span
                                className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary text-white"
                                title="Tidak boleh dicabut (anti-lockout)"
                              >
                                <Check size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving}
                                onChange={(e) => toggle(r, p.key, e.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-neutral-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`${p.label} untuk ${ROLE_LABEL[r]}`}
                              />
                            )}
                            {protectedFlag && (
                              <Badge tone="warning">
                                <Lock size={9} /> Wajib
                              </Badge>
                            )}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Izin ini adalah default per role dan ditegakkan di API. Override per akun kasir diatur di halaman Pengguna &amp; Kasir.
        Izin berlabel <strong>Wajib</strong> tidak bisa dicabut agar admin tidak ter-lockout.
      </p>
    </div>
  );
}

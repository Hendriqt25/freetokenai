'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2, AlertCircle, Check } from 'lucide-react';

type PermissionDef = { key: string; label: string; description: string };
type Role = 'super_admin' | 'kasir' | 'customer';

const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Admin',
  kasir: 'Kasir',
  customer: 'User',
};

export default function AdminRbacPage() {
  const [catalog, setCatalog] = useState<PermissionDef[]>([]);
  const [roles, setRoles] = useState<Record<Role, Record<string, boolean>> | null>(null);
  const [protectedMap, setProtectedMap] = useState<Partial<Record<Role, string[]>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    load();
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
    const id = `${role}:${key}`;
    setSavingKey(id);
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

  const isProtected = (role: Role, key: string) =>
    protectedMap[role]?.includes(key) ?? false;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <ShieldCheck size={22} className="text-primary" aria-hidden />
          Matriks Hak Akses (RBAC)
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          Centang / hapus centang untuk mengubah izin per role. Perubahan berlaku langsung.
        </p>
      </header>

      {notice && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-sm">
          <Check size={16} className="shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-800 dark:text-red-300 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm">
        {loading || !roles ? (
          <div className="py-16 flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 dark:text-neutral-400 text-xs uppercase border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fitur / Akses</th>
                  {(['super_admin', 'kasir', 'customer'] as Role[]).map((r) => (
                    <th key={r} className="px-4 py-3 font-semibold text-center whitespace-nowrap">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {catalog.map((p) => (
                  <tr key={p.key} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30 transition">
                    <th scope="row" className="px-4 py-3.5 font-medium text-neutral-900 dark:text-white text-left">
                      <div>{p.label}</div>
                      <div className="text-xs text-neutral-400 font-normal">{p.description}</div>
                    </th>
                    {(['super_admin', 'kasir', 'customer'] as Role[]).map((r) => {
                      const protectedFlag = isProtected(r, p.key);
                      const checked = roles[r]?.[p.key] ?? false;
                      const saving = savingKey === `${r}:${p.key}`;
                      return (
                        <td key={r} className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={protectedFlag || saving}
                            onChange={(e) => toggle(r, p.key, e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary disabled:opacity-40 disabled:cursor-not-allowed"
                            title={protectedFlag ? 'Tidak boleh dicabut (anti-lockout)' : ''}
                          />
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
        Izin yang dicentang di sini berlaku sebagai default per role. Override per akun kasir bisa diatur di halaman Pengguna & Kasir. Izin yang ditandai anti-lockout tidak bisa dicabut.
      </p>
    </div>
  );
}
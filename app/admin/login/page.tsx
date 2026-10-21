'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Loader2 } from 'lucide-react';

// ponytail: login cookie web /admin — verifikasi password super_admin, route
// cookie-login set ftai_admin_session (terpisah dari customer); redirect ke /admin.
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/auth/cookie-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-5 flex items-center gap-2 text-primary">
            <Building2 size={22} />
            <h1 className="text-lg font-bold text-neutral-900 dark:text-white">Super Admin</h1>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Masuk
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-neutral-500">
          <Link href="/dashboard" className="hover:underline">
            ← Kembali ke Dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
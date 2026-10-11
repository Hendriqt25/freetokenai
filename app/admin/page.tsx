'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, BarChart3, CreditCard, Calendar, Users, Loader2, AlertCircle } from 'lucide-react';

type Cafe = {
  id: string;
  name: string;
  prepaid_quota: number;
  token_balance: number;
  expires_at: string | null;
  active_workspaces: number;
  total_granted: number;
};

export default function AdminPage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCafes();
  }, []);

  async function loadCafes() {
    try {
      const res = await fetch('/api/v1/admin/cafes', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCafes(data.cafes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat cafe');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Tidak ada';
    return new Date(dateStr).toLocaleDateString('id-ID');
  }

  function formatNumber(n: number) {
    return n.toLocaleString('id-ID');
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Daftar Cafe</h1>
        <p className="text-neutral-500 dark:text-neutral-400">Kelola cafe, kuota prepaid, dan lihat penggunaan token</p>
      </header>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300" role="alert">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : cafes.length === 0 ? (
        <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
          <Building2 size={48} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
          <p>Belum ada cafe. Tambah cafe via database atau seed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cafes.map((cafe) => (
            <Link
              key={cafe.id}
              href={`/admin/cafes/${cafe.id}`}
              className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 hover:border-primary/50 hover:shadow-lg transition flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-white">{cafe.name}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{cafe.id.slice(0, 8)}...</p>
                  </div>
                </div>
                <BarChart3 size={20} className="text-neutral-400 dark:text-neutral-500" />
              </div>

              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 dark:bg-primary/10">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-primary" />
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">Token Balance</span>
                  </div>
                  <span className="font-bold text-lg text-primary dark:text-primary">{formatNumber(cafe.token_balance)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
                    <p className="text-neutral-500 dark:text-neutral-400">Prepaid Quota</p>
                    <p className="font-medium text-neutral-900 dark:text-white">{formatNumber(cafe.prepaid_quota)} Token</p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
                    <p className="text-neutral-500 dark:text-neutral-400">Total Granted</p>
                    <p className="font-medium text-neutral-900 dark:text-white">{formatNumber(cafe.total_granted)} Token</p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
                    <p className="text-neutral-500 dark:text-neutral-400">Aktif Sampai</p>
                    <p className="font-medium text-neutral-900 dark:text-white">{formatDate(cafe.expires_at)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
                    <p className="text-neutral-500 dark:text-neutral-400">Workspace</p>
                    <p className="font-medium text-neutral-900 dark:text-white">{cafe.active_workspaces}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                <span className="text-sm text-primary font-medium flex items-center gap-1">
                  Lihat detail penggunaan API →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
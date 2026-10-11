'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, BarChart3, CreditCard, Calendar, Users, Loader2, AlertCircle, ChevronLeft, Activity, TrendingUp } from 'lucide-react';

type Workspace = { id: string; name: string; token_balance: number; expires_at: string | null };
type UsageByEndpoint = { endpoint_type: string; tokens_burned: number; count: number };
type UsageByDay = { day: string; tokens_burned: number; count: number };

type CafeDetail = {
  cafe: {
    id: string;
    name: string;
    prepaid_quota: number;
    token_balance: number;
    expires_at: string | null;
  };
  workspaces: Workspace[];
  usage: {
    byEndpoint: UsageByEndpoint[];
    byDay: UsageByDay[];
  };
};

export default function CafeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [params]);

  async function loadData() {
    try {
      const { id } = await params;
      const res = await fetch(`/api/v1/admin/cafes/${id}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail cafe');
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

  function formatDay(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const totalTokensBurned = data?.usage.byEndpoint.reduce((sum, u) => sum + u.tokens_burned, 0) ?? 0;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/admin" className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-primary">
            <ChevronLeft size={18} />
            Kembali
          </Link>
        </div>
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/admin" className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-primary">
            <ChevronLeft size={18} />
            Kembali
          </Link>
        </div>
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-700 dark:text-red-300" role="alert">
          <AlertCircle size={18} />
          <span className="text-sm">{error || 'Cafe tidak ditemukan'}</span>
        </div>
      </div>
    );
  }

  const { cafe, workspaces, usage } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-primary mb-2">
            <ChevronLeft size={18} />
            Kembali ke Daftar Cafe
          </Link>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Building2 size={24} className="text-primary" />
            {cafe.name}
          </h1>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center gap-2 text-primary mb-2">
            <CreditCard size={18} />
            <span className="text-sm font-medium">Token Balance</span>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{formatNumber(cafe.token_balance)} Token</p>
        </div>
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 mb-2">
            <CreditCard size={18} />
            <span className="text-sm">Prepaid Quota</span>
          </div>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{formatNumber(cafe.prepaid_quota)} Token</p>
        </div>
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 mb-2">
            <Activity size={18} />
            <span className="text-sm">Total Terpakai</span>
          </div>
          <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{formatNumber(totalTokensBurned)} Token</p>
        </div>
        <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400 mb-2">
            <Calendar size={18} />
            <span className="text-sm">Aktif Sampai</span>
          </div>
          <p className="text-xl font-semibold text-neutral-900 dark:text-white">{formatDate(cafe.expires_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
            <BarChart3 size={18} className="text-primary" />
            Penggunaan API per Endpoint
          </h2>
          {usage.byEndpoint.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <Activity size={32} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
              <p>Belum ada data penggunaan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usage.byEndpoint.map((item) => (
                <div key={item.endpoint_type} className="flex items-center gap-4">
                  <div className="w-24 text-sm text-neutral-500 dark:text-neutral-400 capitalize">{item.endpoint_type}</div>
                  <div className="flex-1 h-6 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${totalTokensBurned > 0 ? (item.tokens_burned / totalTokensBurned) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-28 text-right text-sm font-medium text-neutral-900 dark:text-white">
                    {formatNumber(item.tokens_burned)} ({item.count} req)
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary" />
            Tren Penggunaan (30 hari)
          </h2>
          {usage.byDay.length === 0 ? (
            <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
              <Activity size={32} className="mx-auto mb-2 text-neutral-300 dark:text-neutral-600" />
              <p>Belum ada data harian</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {usage.byDay.map((item) => (
                <div key={item.day} className="flex items-center gap-3 text-sm">
                  <div className="w-24 text-neutral-500 dark:text-neutral-400">{formatDay(item.day)}</div>
                  <div className="flex-1 h-4 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${totalTokensBurned > 0 ? (item.tokens_burned / totalTokensBurned) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-24 text-right font-medium text-neutral-900 dark:text-white">
                    {formatNumber(item.tokens_burned)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
          <Users size={18} className="text-primary" />
          Workspace Cafe Ini ({workspaces.length})
        </h2>
        {workspaces.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400 text-center py-4">Belum ada workspace untuk cafe ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                  <th className="pb-2 font-medium">Nama</th>
                  <th className="pb-2 font-medium">Token Balance</th>
                  <th className="pb-2 font-medium">Aktif Sampai</th>
                </tr>
              </thead>
              <tbody>
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <td className="py-3 font-medium text-neutral-900 dark:text-white">{ws.name}</td>
                    <td className="py-3 text-neutral-900 dark:text-white">{formatNumber(ws.token_balance)} Token</td>
                    <td className="py-3 text-neutral-500 dark:text-neutral-400">{formatDate(ws.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
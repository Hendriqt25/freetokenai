'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  ChevronLeft,
  CreditCard,
  Wallet,
} from 'lucide-react';
import BalanceModal from '@/components/admin/BalanceModal';
import {
  Alert,
  Badge,
  EmptyState,
  Loading,
  PageHeader,
  StatCard,
  cardCls,
} from '@/components/admin/ui';

type Workspace = { id: string; name: string; token_balance: number; expires_at: string | null };
type UsageByEndpoint = { endpoint_type: string; tokens_burned: number; count: number };
type UsageByDay = { day: string; tokens_burned: number; count: number };
type Tx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
};

type CafeDetail = {
  cafe: {
    id: string;
    name: string;
    is_active: boolean;
    token_balance: number;
    total_topup: number;
    total_used: number;
    last_activity_at: string | null;
    expires_at: string | null;
  };
  workspaces: Workspace[];
  transactions: Tx[];
  usage: { byEndpoint: UsageByEndpoint[]; byDay: UsageByDay[] };
};

const n = (v: number) => v.toLocaleString('id-ID');
const d = (v: string | null) => (v ? new Date(v).toLocaleDateString('id-ID') : '-');
const dtime = (v: string) => new Date(v).toLocaleString('id-ID');

const TX_META: Record<string, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  topup: { label: 'Top-Up', tone: 'success' },
  reserve: { label: 'Reserve', tone: 'danger' },
  refund: { label: 'Refund', tone: 'warning' },
  adjustment: { label: 'Koreksi', tone: 'neutral' },
};

const TABS = [
  { id: 'usage', label: 'Penggunaan API' },
  { id: 'ledger', label: 'Riwayat Saldo' },
  { id: 'workspace', label: 'Workspace' },
] as const;

export default function CafeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CafeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('usage');
  const [balanceMode, setBalanceMode] = useState<'topup' | 'adjust' | null>(null);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/cafes/${id}`, { credentials: 'include', cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail cafe');
    } finally {
      setLoading(false);
    }
  }

  const burned = data?.usage.byEndpoint.reduce((s, u) => s + u.tokens_burned, 0) ?? 0;

  if (loading) return <div className={cardCls}><Loading label="Memuat detail cafe..." /></div>;

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
          <ChevronLeft size={16} /> Kembali
        </Link>
        <Alert>{error || 'Cafe tidak ditemukan'}</Alert>
      </div>
    );
  }

  const { cafe, workspaces, transactions, usage } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-primary">
        <ChevronLeft size={16} /> Daftar Cafe
      </Link>

      <PageHeader
        title={cafe.name}
        description={`Aktivitas terakhir: ${cafe.last_activity_at ? dtime(cafe.last_activity_at) : 'belum ada transaksi'}`}
        icon={<Building2 size={22} className="text-primary" />}
        action={
          <>
            <Badge tone={cafe.is_active ? 'success' : 'neutral'}>{cafe.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
            <button
              type="button"
              onClick={() => setBalanceMode('topup')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              <ArrowDownLeft size={15} /> Tambah Saldo
            </button>
            <button
              type="button"
              onClick={() => setBalanceMode('adjust')}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:border-primary hover:text-primary dark:border-neutral-600 dark:text-neutral-300"
            >
              Koreksi
            </button>
          </>
        }
      />

      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Saldo Token"
          value={n(cafe.token_balance)}
          hint={cafe.token_balance < 5000 ? 'Saldo rendah' : 'Siap dipakai'}
          icon={<Wallet size={16} />}
          tone={cafe.token_balance < 5000 ? 'danger' : 'primary'}
        />
        <StatCard label="Total Top-Up" value={n(cafe.total_topup)} hint="akumulasi masuk" icon={<ArrowDownLeft size={16} />} tone="success" />
        <StatCard label="Total Terpakai" value={n(cafe.total_used)} hint="akumulasi keluar" icon={<ArrowUpRight size={16} />} tone="warning" />
        <StatCard label="Aktif Sampai" value={d(cafe.expires_at)} hint={`${workspaces.length} workspace`} icon={<Calendar size={16} />} tone="neutral" />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === t.id ? 'bg-primary text-white' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            {t.label}
            {t.id === 'ledger' && ` (${transactions.length})`}
            {t.id === 'workspace' && ` (${workspaces.length})`}
          </button>
        ))}
      </div>

      {tab === 'usage' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className={`${cardCls} p-5`}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
              <BarChart3 size={16} className="text-primary" /> Token per Endpoint
            </h2>
            {usage.byEndpoint.length === 0 ? (
              <EmptyState title="Belum ada penggunaan" description="Pemakaian API dari workspace cafe ini akan muncul di sini." icon={<Activity size={32} />} />
            ) : (
              <div className="space-y-3">
                {usage.byEndpoint.map((item) => (
                  <div key={item.endpoint_type} className="text-xs">
                    <div className="mb-1 flex justify-between">
                      <span className="capitalize text-neutral-600 dark:text-neutral-300">{item.endpoint_type}</span>
                      <span className="font-medium text-neutral-900 dark:text-white">{n(item.tokens_burned)} ({item.count} req)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${burned > 0 ? (item.tokens_burned / burned) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${cardCls} p-5`}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
              <Activity size={16} className="text-primary" /> Tren 30 Hari
            </h2>
            {usage.byDay.length === 0 ? (
              <EmptyState title="Belum ada data harian" icon={<Activity size={32} />} />
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {usage.byDay.map((item) => {
                  const max = Math.max(...usage.byDay.map((u) => u.tokens_burned), 1);
                  return (
                    <div key={item.day} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-neutral-500">{d(item.day)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(item.tokens_burned / max) * 100}%` }} />
                      </div>
                      <span className="w-16 text-right font-medium text-neutral-800 dark:text-neutral-100">{n(item.tokens_burned)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'ledger' && (
        <section className={`${cardCls} overflow-hidden`}>
          <div className="border-b border-neutral-100 px-5 py-3 dark:border-neutral-700/60">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
              <CreditCard size={16} className="text-primary" /> 20 transaksi terakhir
            </h2>
            <p className="mt-0.5 text-xs text-neutral-400">Nilai positif = saldo masuk, negatif = saldo keluar.</p>
          </div>
          {transactions.length === 0 ? (
            <EmptyState title="Belum ada transaksi saldo" icon={<Wallet size={32} />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Waktu</th>
                    <th className="px-4 py-3 font-semibold">Tipe</th>
                    <th className="px-4 py-3 font-semibold">Jumlah</th>
                    <th className="px-4 py-3 font-semibold">Saldo Setelah</th>
                    <th className="px-4 py-3 font-semibold">Oleh</th>
                    <th className="px-4 py-3 font-semibold">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                  {transactions.map((t) => {
                    const meta = TX_META[t.type] ?? TX_META.adjustment;
                    return (
                      <tr key={t.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30">
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{dtime(t.created_at)}</td>
                        <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                        <td className={`px-4 py-3 text-xs font-semibold ${t.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {t.amount > 0 ? '+' : ''}{n(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs">{n(t.balance_after)}</td>
                        <td className="px-4 py-3 text-xs">{t.created_by || '-'}</td>
                        <td className="px-4 py-3 text-xs text-neutral-500">{t.note || t.reference_type || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'workspace' && (
        <section className={`${cardCls} overflow-hidden`}>
          <div className="border-b border-neutral-100 px-5 py-3 dark:border-neutral-700/60">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Workspace ({workspaces.length})</h2>
          </div>
          {workspaces.length === 0 ? (
            <EmptyState title="Belum ada workspace" description="Workspace dibuat otomatis saat customer memakai API key." icon={<Building2 size={32} />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nama</th>
                    <th className="px-4 py-3 font-semibold">Saldo</th>
                    <th className="px-4 py-3 font-semibold">Aktif Sampai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                  {workspaces.map((ws) => (
                    <tr key={ws.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30">
                      <td className="px-4 py-3 text-xs font-medium text-neutral-900 dark:text-white">{ws.name}</td>
                      <td className="px-4 py-3 text-xs">{n(ws.token_balance)} token</td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{d(ws.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {balanceMode && (
        <BalanceModal
          cafe={cafe}
          defaultMode={balanceMode}
          onClose={() => setBalanceMode(null)}
          onDone={async (msg) => {
            setBalanceMode(null);
            setNotice(msg);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

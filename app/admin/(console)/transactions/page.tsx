'use client';

import { useState, useEffect } from 'react';
import { ScrollText, Loader2, AlertCircle, Search } from 'lucide-react';

type TxRow = {
  id: string;
  cafe_name: string | null;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  receipt_code: string | null;
  receipt_tokens: number | null;
  created_at: string;
  kasir_name: string | null;
  kasir_email: string | null;
};

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  topup: { label: 'Top-Up', cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
  reserve: { label: 'Reserve', cls: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' },
  refund: { label: 'Refund', cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
  adjustment: { label: 'Adjustment', cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300' },
};

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kasirFilter, setKasirFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [days, setDays] = useState(30);
  const [kasirs, setKasirs] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);

  useEffect(() => {
    // load kasir list
    fetch('/api/v1/admin/users?role=kasir', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setKasirs(d.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [kasirFilter, typeFilter, days]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (kasirFilter) params.set('kasir_id', kasirFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('days', String(days));
      const res = await fetch(`/api/v1/admin/transactions?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal memuat');
      setRows(data.transactions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <ScrollText size={22} className="text-primary" />
          Riwayat Transaksi (Semua Kasir)
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Audit trail transaksi kuota kafe. Filter per kasir / tipe / rentang hari.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-center gap-2 text-red-800 dark:text-red-300 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white dark:bg-neutral-800 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
        <select
          value={kasirFilter}
          onChange={(e) => setKasirFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white outline-none focus:border-primary"
        >
          <option value="">Semua Kasir</option>
          {kasirs.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name || k.email}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white outline-none focus:border-primary"
        >
          <option value="">Semua Tipe</option>
          <option value="topup">Top-Up</option>
          <option value="reserve">Reserve</option>
          <option value="refund">Refund</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-900 dark:text-white outline-none focus:border-primary"
        >
          <option value={7}>7 hari</option>
          <option value={30}>30 hari</option>
          <option value={90}>90 hari</option>
        </select>
      </div>

      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-neutral-400 text-sm">Tidak ada transaksi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 dark:text-neutral-400 text-xs uppercase border-b border-neutral-200 dark:border-neutral-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Waktu</th>
                  <th className="px-4 py-3 font-semibold">Cafe</th>
                  <th className="px-4 py-3 font-semibold">Kasir</th>
                  <th className="px-4 py-3 font-semibold">Tipe</th>
                  <th className="px-4 py-3 font-semibold">Jumlah</th>
                  <th className="px-4 py-3 font-semibold">Saldo Setelah</th>
                  <th className="px-4 py-3 font-semibold">Referensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
                {rows.map((t) => {
                  const tl = TYPE_LABEL[t.type] ?? TYPE_LABEL.adjustment;
                  return (
                    <tr key={t.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-700/30 transition">
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap">{new Date(t.created_at).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3.5 text-xs">{t.cafe_name || '-'}</td>
                      <td className="px-4 py-3.5 text-xs">
                        <div>{t.kasir_name || '-'}</div>
                        <div className="text-neutral-400">{t.kasir_email || ''}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tl.cls}`}>
                          {tl.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-xs font-medium ${t.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('id-ID')}
                      </td>
                      <td className="px-4 py-3.5 text-xs">{t.balance_after.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3.5 text-xs">
                        {t.receipt_code ? `Struk ${t.receipt_code} (${t.receipt_tokens} token)` : (t.reference_type || '-')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
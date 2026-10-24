'use client';

import { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { Alert, Modal, inputCls } from '@/components/admin/ui';

export default function BalanceModal({
  cafe,
  defaultMode = 'topup',
  onClose,
  onDone,
}: {
  cafe: { id: string; name: string; token_balance: number };
  defaultMode?: 'topup' | 'adjust';
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<'topup' | 'adjust'>(defaultMode);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || (mode === 'topup' ? value < 1 : value === 0)) {
      setError(mode === 'topup' ? 'Jumlah top-up minimal 1 token.' : 'Koreksi tidak boleh 0.');
      return;
    }
    if (mode === 'adjust' && note.trim().length < 3) {
      setError('Catatan koreksi wajib diisi (min. 3 karakter).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/admin/cafes/${cafe.id}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode, amount: value, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? 'Gagal menyimpan saldo');
      onDone(
        `Saldo ${cafe.name} ${value > 0 ? '+' : ''}${value.toLocaleString('id-ID')} → ${Number(data.token_balance).toLocaleString('id-ID')} token.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan saldo');
    } finally {
      setSubmitting(false);
    }
  }

  const next = cafe.token_balance + Number(amount || 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`${mode === 'topup' ? 'Tambah' : 'Koreksi'} Saldo - ${cafe.name}`}
      icon={<Wallet size={18} className="text-primary" />}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700">
            Batal
          </button>
          <button type="submit" form="balance-form" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Simpan
          </button>
        </>
      }
    >
      <form id="balance-form" onSubmit={submit} className="space-y-4">
        <div className="flex rounded-lg border border-neutral-200 p-1 dark:border-neutral-700">
          {(['topup', 'adjust'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === m ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              {m === 'topup' ? 'Tambah saldo' : 'Koreksi (bisa minus)'}
            </button>
          ))}
        </div>

        <p className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900/50">
          Saldo sekarang: <strong>{cafe.token_balance.toLocaleString('id-ID')}</strong> token
          {amount && Number(amount) !== 0 ? (
            <>
              {' '}→ <strong>{next.toLocaleString('id-ID')}</strong>
            </>
          ) : null}
        </p>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {mode === 'topup' ? 'Jumlah top-up' : 'Koreksi (+/-)'}
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mode === 'topup' ? '50000' : '-2500'}
            className={inputCls}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Catatan {mode === 'adjust' ? <span className="text-red-500">*</span> : <span className="text-neutral-400">(opsional)</span>}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder={mode === 'adjust' ? 'Contoh: koreksi salah input struk' : 'Contoh: transfer bank BCA'}
            className={inputCls}
          />
        </label>

        {mode === 'adjust' && (
          <p className="text-xs text-neutral-500">Koreksi negatif tidak boleh membuat saldo cafe negatif.</p>
        )}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}

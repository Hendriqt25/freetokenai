"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Badge, PageHeader, Progress, cardCls, inputCls } from "@/components/admin/ui";
import { KEY_STATUS, useKasir } from "@/components/kasir/KasirShell";

type KeyInfo = {
  id: string;
  prefix: string;
  name: string | null;
  status: string;
  remaining: number;
  token_quota: number;
  tokens_used: number;
  expires_at: string | null;
  revoked_reason: string | null;
  cafe_name: string | null;
};

const n = (v: number) => v.toLocaleString("id-ID");

export default function KasirStatusPage() {
  const { authFetch, setError } = useKasir();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<KeyInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    const value = input.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const params = value.startsWith("rst_live_") ? `key=${encodeURIComponent(value)}` : `prefix=${encodeURIComponent(value)}`;
      const res = await authFetch(`/api/v1/admin/api-keys/lookup?${params}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? `Gagal mengecek key (HTTP ${res.status}).`);
        return;
      }
      setResult(data.key as KeyInfo);
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  const status = result ? (KEY_STATUS[result.status] ?? KEY_STATUS.disabled) : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Cek Status Key"
        description="Tempel API key lengkap atau prefix-nya untuk melihat sisa kuota pelanggan."
        icon={<Search size={22} className="text-primary" />}
      />

      <div className={`${cardCls} p-5`}>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">API key / prefix</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void check();
            }}
            placeholder="rst_live_… atau 10 karakter prefix"
            className={`${inputCls} mt-1`}
          />
        </label>
        <button
          type="button"
          onClick={check}
          disabled={busy || !input.trim()}
          className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Mengecek…" : "Cek Status"}
        </button>
      </div>

      {result && status && (
        <div className={`${cardCls} p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {result.prefix}…
            </span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">{result.name || "Tanpa nama"}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {result.cafe_name && <span className="ml-auto text-[11px] text-neutral-400">{result.cafe_name}</span>}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Progress value={result.remaining} max={result.token_quota} />
            <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
              <span className="font-semibold text-neutral-900 dark:text-white">{n(result.remaining)}</span> / {n(result.token_quota)}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-900/50">
              <dt className="text-neutral-400">Terpakai</dt>
              <dd className="font-semibold text-neutral-800 dark:text-neutral-100">{n(result.tokens_used)} token</dd>
            </div>
            <div className="rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-900/50">
              <dt className="text-neutral-400">Kedaluwarsa</dt>
              <dd className="font-semibold text-neutral-800 dark:text-neutral-100">
                {result.expires_at ? new Date(result.expires_at).toLocaleDateString("id-ID") : "—"}
              </dd>
            </div>
          </dl>

          {result.revoked_reason && <p className="mt-3 text-xs text-red-500">Alasan dicabut: {result.revoked_reason}</p>}
        </div>
      )}
    </div>
  );
}

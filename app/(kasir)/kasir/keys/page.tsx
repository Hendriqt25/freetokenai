"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import {
  Badge,
  EmptyState,
  Loading,
  PageHeader,
  Progress,
  cardCls,
  inputCls,
} from "@/components/admin/ui";
import { KEY_STATUS, useKasir } from "@/components/kasir/KasirShell";

type KeyRow = {
  id: string;
  key_prefix: string;
  name: string | null;
  token_quota: number;
  tokens_used: number;
  remaining?: number;
  status?: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_reason?: string | null;
};

const n = (v: number) => v.toLocaleString("id-ID");
const date = (v: string | null) => (v ? new Date(v).toLocaleDateString("id-ID") : "—");

export default function KasirKeysPage() {
  const { pkgs, authFetch, setError } = useKasir();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ key: string; prefix: string; quota: number; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/v1/admin/api-keys?mine=1");
      if (!res.ok) {
        setError(`Gagal memuat API key (HTTP ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { keys: KeyRow[] };
      setKeys(data.keys ?? []);
    } finally {
      setLoading(false);
    }
  }, [authFetch, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pkgId && pkgs && pkgs.length > 0) setPkgId(pkgs[0].id);
  }, [pkgId, pkgs]);

  async function issue() {
    setBusy(true);
    setError(null);
    setGenerated(null);
    try {
      const res = await authFetch("/api/v1/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkgId, name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? `Gagal menerbitkan key (HTTP ${res.status}).`);
        return;
      }
      setGenerated({
        key: data.key,
        prefix: data.api_key.key_prefix,
        quota: data.api_key.token_quota,
        expires_at: data.api_key.expires_at,
      });
      setName("");
      void load();
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="API Key Saya"
        description="Terbitkan key baru dan pantau sisa kuota key yang Anda buat."
        icon={<KeyRound size={22} className="text-primary" />}
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:border-primary hover:text-primary disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Muat ulang
          </button>
        }
      />

      <div className={cardCls}>
        <div className="border-b border-neutral-100 px-5 py-4 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Terbitkan API Key</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Kuota key diambil dari saldo prepaid cafe. Key lengkap hanya tampil sekali.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Nama key (opsional)</span>
            <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="cth. Pelanggan Budi" className={`${inputCls} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Paket</span>
            <select value={pkgId} onChange={(e) => setPkgId(e.target.value)} className={`${inputCls} mt-1`} disabled={!pkgs || pkgs.length === 0}>
              {!pkgs || pkgs.length === 0 ? (
                <option value="">{pkgs ? "Belum ada paket" : "Memuat paket…"}</option>
              ) : (
                pkgs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {n(p.tokens_granted)} token
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={issue}
              disabled={busy || !pkgId}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Menerbitkan…" : "Terbitkan Key"}
            </button>
          </div>
        </div>

        {generated && (
          <div className="mx-5 mb-5 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
            <p className="text-xs font-semibold text-purple-800 dark:text-purple-200">Key terbit — simpan sekarang, tidak ditampilkan lagi</p>
            <p className="mt-2 break-all rounded bg-white p-2 font-mono text-xs text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">{generated.key}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-neutral-600 dark:text-neutral-300">
              <span>Prefix {generated.prefix}</span>
              <span>Kuota {n(generated.quota)} token</span>
              <span>Expired {date(generated.expires_at)}</span>
              <button
                type="button"
                onClick={copyKey}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-purple-300 px-2.5 py-1.5 font-semibold text-purple-800 transition hover:bg-purple-100 dark:border-purple-700 dark:text-purple-200 dark:hover:bg-purple-900/40"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Tersalin" : "Salin"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Key yang saya buat</h2>
          <span className="text-[11px] text-neutral-400">{keys.length} key</span>
        </div>
        {loading ? (
          <Loading label="Memuat API key..." />
        ) : keys.length === 0 ? (
          <EmptyState title="Belum ada key" description="Key yang Anda terbitkan akan muncul di sini." icon={<KeyRound size={32} />} />
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-700/50">
            {keys.map((k) => {
              const status = KEY_STATUS[k.status ?? "active"] ?? KEY_STATUS.disabled;
              const remaining = k.remaining ?? Math.max(0, k.token_quota - k.tokens_used);
              return (
                <li key={k.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {k.key_prefix}…
                    </span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-white">{k.name || "Tanpa nama"}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="ml-auto text-[11px] text-neutral-400">Expired {date(k.expires_at)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Progress value={remaining} max={k.token_quota} />
                    <span className="shrink-0 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-100">{n(remaining)}</span> / {n(k.token_quota)}
                    </span>
                  </div>
                  {k.last_used_at && (
                    <p className="mt-1 text-[11px] text-neutral-400">Terakhir dipakai {new Date(k.last_used_at).toLocaleString("id-ID")}</p>
                  )}
                  {k.revoked_reason && <p className="mt-1 text-[11px] text-red-500">Alasan: {k.revoked_reason}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

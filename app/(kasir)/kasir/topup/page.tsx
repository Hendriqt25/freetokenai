"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Alert, PageHeader, cardCls, inputCls } from "@/components/admin/ui";
import { useKasir } from "@/components/kasir/KasirShell";

const n = (v: number) => v.toLocaleString("id-ID");

export default function KasirTopupPage() {
  const { pkgs, authFetch, setError } = useKasir();
  const [input, setInput] = useState("");
  const [pkgId, setPkgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!pkgId && pkgs && pkgs.length > 0) setPkgId(pkgs[0].id);
  }, [pkgId, pkgs]);

  const selected = pkgs?.find((p) => p.id === pkgId);

  async function topup() {
    const value = input.trim();
    if (!value || !pkgId) return;
    setBusy(true);
    setError(null);
    setMsg("");
    try {
      const params = value.startsWith("rst_live_") ? `key=${encodeURIComponent(value)}` : `prefix=${encodeURIComponent(value)}`;
      const lookup = await authFetch(`/api/v1/admin/api-keys/lookup?${params}`);
      const lookupData = await lookup.json().catch(() => null);
      if (!lookup.ok) {
        setError(lookupData?.error?.message ?? "Key tidak ditemukan.");
        return;
      }
      const res = await authFetch(`/api/v1/admin/api-keys/${lookupData.key.id}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkgId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? `Top-up gagal (HTTP ${res.status}).`);
        return;
      }
      setMsg(
        `Top-up berhasil — kuota ${n(lookupData.key.prefix)}… sekarang ${n(data.token_quota)} token, expired ${new Date(
          data.expires_at,
        ).toLocaleDateString("id-ID")}.`,
      );
      setInput("");
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        title="Top-Up Key"
        description="Tambah kuota key pelanggan. Kuota diambil dari saldo prepaid cafe Anda."
        icon={<Wallet size={22} className="text-primary" />}
      />

      <div className={`${cardCls} space-y-3 p-5`}>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">API key / prefix pelanggan</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="rst_live_… atau 10 karakter prefix"
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Paket top-up</span>
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
          {selected && <span className="mt-1 block text-[11px] text-neutral-400">{selected.default_expires_days ?? 0} hari tambahan masa aktif</span>}
        </label>
        <button
          type="button"
          onClick={topup}
          disabled={busy || !input.trim() || !pkgId}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Top-Up"}
        </button>
        <p className="text-[11px] text-neutral-400">
          Saldo cafe terpotong sebesar token paket. Key harus milik Anda dan belum dicabut.
        </p>
        {msg && <Alert tone="success" onClose={() => setMsg("")}>{msg}</Alert>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ReceiptText } from "lucide-react";
import { PageHeader, cardCls, inputCls } from "@/components/admin/ui";
import { idr, useKasir } from "@/components/kasir/KasirShell";

type Receipt = { code: string; claim_url: string; tokens: number };

const newRef = () => `WEB-${Date.now()}`;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:border-primary hover:text-primary dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "Tersalin" : label}
    </button>
  );
}

export default function KasirStrukPage() {
  const { pkgs, authFetch, setError } = useKasir();
  const [mode, setMode] = useState<"package" | "manual">("package");
  const [pkgId, setPkgId] = useState("");
  const [manual, setManual] = useState("");
  const [ref, setRef] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRef(newRef());
  }, []);

  useEffect(() => {
    if (mode === "package" && !pkgId && pkgs && pkgs.length > 0) setPkgId(pkgs[0].id);
  }, [mode, pkgId, pkgs]);

  const selected = pkgs?.find((p) => p.id === pkgId);
  const manualTokens = Number(manual);
  const manualOk = Number.isInteger(manualTokens) && manualTokens >= 1 && manualTokens <= 10_000_000;
  const canSubmit = mode === "package" ? Boolean(pkgId) : manualOk;

  async function generate() {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const body =
        mode === "package"
          ? { token_package_id: pkgId, pos_reference_id: ref || newRef() }
          : { tokens: manualTokens, pos_reference_id: ref || newRef() };
      const res = await authFetch("/api/v1/admin/receipts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? `Gagal membuat struk (HTTP ${res.status}).`);
        return;
      }
      setReceipt({ code: data.code, claim_url: data.claim_url, tokens: data.tokens });
      setRef(newRef());
    } catch {
      setError("Tidak dapat menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Buat Struk"
        description="Pilih paket (atau isi token manual), lalu cetak kode klaim untuk pelanggan."
        icon={<ReceiptText size={22} className="text-primary" />}
      />

      <div className={cardCls}>
        <div className="flex items-center gap-2 border-b border-neutral-100 p-3 dark:border-neutral-700">
          {(["package", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                if (m === "package") setManual("");
                else setPkgId("");
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-primary text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
            >
              {m === "package" ? "Paket" : "Manual"}
            </button>
          ))}
          <span className="ml-auto hidden text-[11px] text-neutral-400 sm:block">Ref: {ref || "…"}</span>
        </div>

        <div className="p-5">
          {mode === "package" ? (
            !pkgs ? (
              <p className="py-6 text-center text-sm text-neutral-500">Memuat paket…</p>
            ) : pkgs.length === 0 ? (
              <p className="py-6 text-center text-sm text-neutral-500">Belum ada paket aktif.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pkgs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPkgId(p.id)}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      pkgId === p.id
                        ? "border-primary bg-primary/5 shadow-sm dark:bg-primary/10"
                        : "border-neutral-200 hover:border-primary/50 dark:border-neutral-700 dark:hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-white">{p.name}</span>
                      {pkgId === p.id && <Check size={16} className="shrink-0 text-primary" />}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{idr(p.rupiah_amount)}</div>
                    <div className="mt-2 text-xl font-bold text-primary">{p.tokens_granted.toLocaleString("id-ID")} token</div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Jumlah token manual</span>
              <input
                type="number"
                min={1}
                max={10_000_000}
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="cth. 1500"
                className={`${inputCls} mt-2`}
              />
              <span className="mt-1 block text-[11px] text-neutral-400">Angka bulat 1–10.000.000.</span>
            </label>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={busy || !canSubmit}
            className="mt-5 w-full rounded-lg bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Memproses…" : mode === "package" && selected ? `Generate ${selected.tokens_granted.toLocaleString("id-ID")} token` : "Generate Struk"}
          </button>
        </div>
      </div>

      {receipt && (
        <div className="overflow-hidden rounded-xl border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 border-b border-emerald-200 px-4 py-3 dark:border-emerald-800">
            <Check size={18} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Struk berhasil dibuat</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Kode struk</div>
              <div className="mt-0.5 font-mono text-xl font-bold text-neutral-900 dark:text-white">{receipt.code}</div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{receipt.tokens.toLocaleString("id-ID")} token</div>
            </div>
            <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">Link klaim pelanggan</div>
              <div className="mt-0.5 break-all text-xs text-neutral-700 dark:text-neutral-200">{receipt.claim_url}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={receipt.code} label="Salin kode" />
              <CopyButton value={receipt.claim_url} label="Salin link klaim" />
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="ml-auto rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover"
              >
                Buat struk baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

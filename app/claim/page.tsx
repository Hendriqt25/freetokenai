"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ReceiptText, Sparkles } from "lucide-react";

type ClaimResult = { token_balance: number; expires_at: string };

const fmtNum = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const fmtDate = (s: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(new Date(s));

export default function ClaimPage() {
  const [code, setCode] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCode(c.trim().toUpperCase());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? `Klaim gagal (HTTP ${res.status}).`);
        return;
      }
      setResult(data.workspace as ClaimResult);
    } catch {
      setError("Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
            <Sparkles size={18} />
          </span>
          <span className="font-sf text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
            FreeTokenAI
          </span>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {result ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
              <h1 className="mt-3 text-xl font-bold text-neutral-900 dark:text-white">Token berhasil diklaim</h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Saldo token masuk ke akun Anda dan berlaku sampai {fmtDate(result.expires_at)}.
              </p>
              <div className="mt-5 rounded-xl bg-primary-soft px-4 py-5 dark:bg-primary/10">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Saldo token</p>
                <p className="font-sf text-3xl font-bold text-primary">+{fmtNum(result.token_balance)}</p>
              </div>
              <a
                href="/"
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover"
              >
                Buka dashboard
              </a>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Anda sudah otomatis masuk di perangkat ini.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center gap-2">
                <ReceiptText className="text-primary" size={22} />
                <div>
                  <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Klaim Token Struk</h1>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Masukkan kode struk dan nomor WhatsApp/email Anda.
                  </p>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label htmlFor="code" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Kode struk
                  </label>
                  <input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="RST-123456"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={20}
                    required
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wider text-neutral-900 outline-none transition focus:border-primary dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="identifier"
                    className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    No. WhatsApp atau email
                  </label>
                  <input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="0812xxxxxxx atau nama@email.com"
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-primary dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !code.trim() || !identifier.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <Loader2 className="animate-spin" size={16} />}
                  {busy ? "Memproses…" : "Klaim token"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                Satu kode struk hanya bisa diklaim satu kali. Token berlaku 7 hari sejak klaim.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

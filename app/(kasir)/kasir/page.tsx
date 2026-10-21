"use client";

import { useCallback, useEffect, useState } from "react";

type Pkg = {
  id: string;
  cafe_id: string | null;
  name: string;
  rupiah_amount: number;
  tokens_granted: number;
  sort_order: number;
};

type Receipt = { code: string; claim_url: string; tokens: number };

// ponytail: Web Kasir universal (PRD v1.6 §5.1 — pengganti repo kasir terpisah).
// Murni client seperti /admin: token bearer admin (POST .../auth/login) di
// localStorage (kunci SAMA dengan /admin agar berbagi sesi). Guard peran di
// sini + enforcement nyata di API (non-kasir -> 403). Server layout tak bisa
// cek Bearer localStorage, jadi tak ada layout khusus — guard = halaman + API.
// QR = <img> generator eksternal + claim_url teks sebagai fallback (tanpa dep
// baru; ganti lib qrcode tervendor bila butuh offline). Cetak = window.print().
const ACCESS_KEY = "ftai:admin:access_token";
const REFRESH_KEY = "ftai:admin:refresh_token";
const USER_KEY = "ftai:admin:user";
type SessionUser = { id: string; role: string; cafe_id: string | null };

function newRef() {
  try {
    return `WEB-${crypto.randomUUID()}`;
  } catch {
    return `WEB-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

export default function KasirPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [pkgId, setPkgId] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const [ref, setRef] = useState<string>(newRef);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = () => localStorage.getItem(ACCESS_KEY) ?? "";
  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setPkgs(null);
    setReceipt(null);
    setError(null);
  }, []);

  const loadPkgs = useCallback(async (t: string) => {
    const res = await fetch("/api/v1/admin/token-packages", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.status === 401) {
      logout();
      setError("Sesi habis — login ulang.");
      return;
    }
    if (!res.ok) {
      setError(`Gagal memuat paket (HTTP ${res.status}).`);
      return;
    }
    const data = (await res.json()) as { packages: Pkg[] };
    setPkgs(data.packages);
    if (data.packages.length > 0) setPkgId((cur) => cur || data.packages[0].id);
  }, [logout]);

  useEffect(() => {
    try {
      const t = localStorage.getItem(ACCESS_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t && u) {
        setUser(JSON.parse(u) as SessionUser);
        void loadPkgs(t);
      }
    } catch {
      logout();
    }
  }, [loadPkgs, logout]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Email/password salah atau bukan akun kasir." : `Login gagal (HTTP ${res.status}).`);
        return;
      }
      const data = (await res.json()) as { access_token: string; refresh_token: string; user: SessionUser };
      localStorage.setItem(ACCESS_KEY, data.access_token);
      localStorage.setItem(REFRESH_KEY, data.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      setPassword("");
      await loadPkgs(data.access_token);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = { pos_reference_id: ref };
      // ponytail: paket dipilih -> tokens dari server (anti-tipu nominal);
      // manual hanya bila kasir sengaja kosongkan pilihan paket.
      if (pkgId) body.token_package_id = pkgId;
      else {
        const t = Number(manual);
        if (!Number.isInteger(t) || t <= 0 || t > 10_000_000) {
          setError("Nominal manual: integer 1–10.000.000, atau pilih paket.");
          return;
        }
        body.tokens = String(t);
      }
      const res = await fetch("/api/v1/admin/receipts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        logout();
        setError("Sesi habis — login ulang.");
        return;
      }
      if (res.status === 402) {
        setError("Kuota token prepaid cafe tidak cukup — hubungi super admin untuk topup.");
        return;
      }
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(detail?.error?.message ?? `Generate gagal (HTTP ${res.status}).`);
        return;
      }
      setReceipt((await res.json()) as Receipt);
    } finally {
      setBusy(false);
    }
  }

  function done() {
    setReceipt(null);
    setRef(newRef()); // ref baru per struk; retry sebelum ini pakai ref sama (idempoten)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 dark:bg-neutral-950 print:block">
      <div className="w-full max-w-md px-4 py-6 print:max-w-none">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-xl font-bold">Kasir — Struk Token</h1>
            <p className="text-xs text-neutral-500">{user ? `Login sebagai kasir${user.cafe_id ? "" : " (tanpa cafe)"}` : "Login kasir untuk generate struk"}</p>
          </div>
          {user && (
            <button onClick={logout} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium dark:border-neutral-700">
              Keluar
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {!user ? (
          <form onSubmit={login} className="mt-4 space-y-3 rounded-xl border border-neutral-200 bg-white p-5 print:hidden dark:border-neutral-800 dark:bg-neutral-900">
            <label className="block text-sm">
              Email kasir
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kasir.kopi@example.com"
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "Masuk…" : "Masuk"}
            </button>
          </form>
        ) : user.role !== "kasir" || !user.cafe_id ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            403 — Halaman ini hanya untuk akun <strong>kasir</strong> yang terikat cafe.
          </div>
        ) : receipt ? (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Kode struk</p>
            <p className="mt-1 font-mono text-3xl font-bold">{receipt.code}</p>
            <p className="mt-1 text-sm text-neutral-500">{receipt.tokens.toLocaleString("id-ID")} Token</p>
            {/* ponytail: QR via generator eksternal (tanpa dep baru); teks claim_url di bawahnya fallback bila offline */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(receipt.claim_url)}`}
              alt={`QR ${receipt.code}`}
              width={240}
              height={240}
              className="mx-auto mt-4 h-60 w-60 rounded-xl border border-neutral-200"
            />
            <p className="mt-3 break-all font-mono text-xs text-neutral-500">{receipt.claim_url}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover"
              >
                Cetak
              </button>
              <button
                onClick={done}
                className="rounded-xl border border-neutral-300 px-4 py-3 text-base font-medium dark:border-neutral-700"
              >
                Selesai
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 print:hidden">
            <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">1. Pilih paket</h2>
              {!pkgs ? (
                <p className="mt-2 text-sm text-neutral-500">Memuat paket…</p>
              ) : pkgs.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">Belum ada paket aktif untuk cafe ini.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {pkgs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPkgId(p.id); setManual(""); }}
                      className={`rounded-xl border p-3 text-left ${pkgId === p.id ? "border-primary bg-primary-soft" : "border-neutral-200 dark:border-neutral-700"}`}
                    >
                      <span className="block text-sm font-semibold">{p.name}</span>
                      <span className="block text-xs text-neutral-500">{idr(p.rupiah_amount)}</span>
                      <span className="block text-sm font-bold text-primary">{p.tokens_granted.toLocaleString("id-ID")} Token</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setPkgId("")}
                className="mt-2 text-xs font-medium text-primary hover:underline"
              >
                {pkgId ? "atau isi nominal manual ↓" : "✕ nominal manual (pakai input di bawah)"}
              </button>
              {!pkgId && (
                <label className="mt-2 block text-sm">
                  Nominal token manual
                  <input
                    type="number"
                    min={1}
                    max={10_000_000}
                    inputMode="numeric"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="cth. 1500"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              )}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">2. Generate struk</h2>
              <p className="mt-1 font-mono text-xs text-neutral-500">ref: {ref}</p>
              <button
                onClick={generate}
                disabled={busy || (!pkgId && !manual)}
                className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? "Generate…" : "Generate Struk"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

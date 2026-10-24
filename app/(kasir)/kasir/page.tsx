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

const ACCESS_KEY = "ftai:admin:access_token";
const REFRESH_KEY = "ftai:admin:refresh_token";
const USER_KEY = "ftai:admin:user";
type SessionUser = { id: string; role: string; cafe_id: string | null };

function idr(n: number) { return `Rp${n.toLocaleString("id-ID")}`; }

export default function KasirPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [pkgId, setPkgId] = useState<string>("");
  const [manual, setManual] = useState<string>("");
  const [mode, setMode] = useState<"package" | "manual">("package");
  const [ref, setRef] = useState<string>("WEB-1");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [keyName, setKeyName] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedInfo, setGeneratedInfo] = useState<{ prefix: string; quota: number; expires_at: string } | null>(null);
  const [myKeys, setMyKeys] = useState<Array<{ id: string; key_prefix: string; name: string | null; token_quota: number; tokens_used: number; remaining?: number; status?: string; expires_at: string | null }>>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [checkInput, setCheckInput] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [topupInput, setTopupInput] = useState("");
  const [topupPkgId, setTopupPkgId] = useState("");
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupMsg, setTopupMsg] = useState<string | null>(null);
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
    if (res.status === 401) { logout(); setError("Sesi habis — login ulang."); return; }
    if (!res.ok) { setError(`Gagal paket (HTTP ${res.status}).`); return; }
    const data = (await res.json()) as { packages: Pkg[] };
    setPkgs(data.packages);
    if (data.packages.length > 0) setPkgId(data.packages[0].id);
  }, [logout]);

  useEffect(() => {
    try {
      const t = localStorage.getItem(ACCESS_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (t && u) { setUser(JSON.parse(u) as SessionUser); void loadPkgs(t); }
    } catch { logout(); }
  }, [loadPkgs]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/admin/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) { setError("Email/password salah."); return; }
      if (!res.ok) { setError(`Login gagal (${res.status}).`); return; }
      const data = await res.json();
      localStorage.setItem(ACCESS_KEY, data.token);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user); void loadPkgs(data.token);
    } finally { setBusy(false); }
  }

  async function loadMyKeysFromAPI() {
    setKeysLoading(true);
    try {
      const res = await fetch("/api/v1/admin/api-keys?mine=1", { headers: { Authorization: `Bearer ${token()}` } });
      if (res.status === 401) { logout(); setError("Sesi habis."); return; }
      if (!res.ok) { setError(`Gagal key (HTTP ${res.status}).`); return; }
      const data = (await res.json()) as { keys: any[] };
      setMyKeys(data.keys || []);
    } finally { setKeysLoading(false); }
  }

  async function generateKey() {
    setKeyBusy(true); setError(null); setGeneratedKey(null); setGeneratedInfo(null);
    try {
      if (!pkgId) { setError("Pilih paket."); return; }
      const res = await fetch("/api/v1/admin/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ package_id: pkgId, name: keyName.trim() || undefined }),
      });
      if (res.status === 401) { logout(); setError("Sesi habis."); return; }
      if (res.status === 403) { setError("Tidak ada izin."); return; }
      if (res.status === 402) { setError("Kuota cafe tidak cukup."); return; }
      if (res.status === 409) { setError("Batas key tercapai."); return; }
      if (!res.ok) { setError(`Gagal (HTTP ${res.status}).`); return; }
      const data = (await res.json()) as { key: string; api_key: { key_prefix: string; token_quota: number; expires_at: string } };
      setGeneratedKey(data.key);
      setGeneratedInfo({ prefix: data.api_key.key_prefix, quota: data.api_key.token_quota, expires_at: data.api_key.expires_at });
      setKeyName(""); void loadMyKeysFromAPI();
    } finally { setKeyBusy(false); }
  }

  function copyKey() { if (!generatedKey) return; try { navigator.clipboard.writeText(generatedKey); } catch {} }

  async function checkStatus() {
    setCheckBusy(true); setError(null); setCheckResult(null);
    try {
      const input = checkInput.trim(); if (!input) { setError("Masukkan key/prefix."); return; }
      const params = input.startsWith("rst_live_") ? `key=${encodeURIComponent(input)}` : `prefix=${encodeURIComponent(input)}`;
      const res = await fetch(`/api/v1/admin/api-keys/lookup?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.status === 401) { logout(); setError("Sesi habis."); return; }
      if (!res.ok) { setError(`Cek gagal (HTTP ${res.status}).`); return; }
      const data = (await res.json()) as { key: any };
      setCheckResult(data.key);
    } finally { setCheckBusy(false); }
  }

  async function topupKey() {
    setTopupBusy(true); setError(null); setTopupMsg(null);
    try {
      const input = topupInput.trim(); if (!input) { setError("Masukkan key."); return; }
      const params = input.startsWith("rst_live_") ? `key=${encodeURIComponent(input)}` : `prefix=${encodeURIComponent(input)}`;
      const lr = await fetch(`/api/v1/admin/api-keys/lookup?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!lr.ok) { setError("Key tidak ditemukan."); return; }
      const ldata = (await lr.json()) as { key: { id: string } };
      const id = ldata.key.id;
      const res = await fetch(`/api/v1/admin/api-keys/${id}/topup`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ package_id: topupPkgId || undefined }),
      });
      if (res.status === 401) { logout(); setError("Sesi habis."); return; }
      if (res.status === 402) { setError("Kuota cafe tidak cukup."); return; }
      if (!res.ok) { setError(`Top-up gagal (HTTP ${res.status}).`); return; }
      const data = (await res.json()) as { token_quota: number; expires_at: string };
      setTopupMsg(`Top-up berhasil. Kuota ${data.token_quota.toLocaleString("id-ID")} token, expired ${new Date(data.expires_at).toLocaleDateString("id-ID")}.`);
      setTopupInput(""); void loadMyKeysFromAPI();
    } finally { setTopupBusy(false); }
  }

  async function done() { setReceipt(null); setRef(`WEB-${Date.now()}`); }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 dark:bg-neutral-950 print:block">
        <div className="w-full max-w-md px-4 py-6 print:max-w-none">
          <form onSubmit={login} className="mt-4 space-y-3 rounded-xl border border-neutral-200 bg-white p-5 print:hidden dark:border-neutral-800 dark:bg-neutral-900">
            <label className="block text-sm">Email kasir <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="kasir.kopi@example.com" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900" /></label>
            <label className="block text-sm">Password <input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="••••••••" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900" /></label>
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-hover disabled:opacity-50">{busy ? "Masuk…" : "Masuk"}</button>
          </form>
        </div>
      </div>
    );
  }
  if (user.role !== "kasir" || !user.cafe_id) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 dark:bg-neutral-950 print:block">
        <div className="w-full max-w-md px-4 py-6 print:max-w-none">
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 print:hidden dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            403 — Halaman ini hanya untuk akun kasir yang terikat cafe.
          </div>
        </div>
      </div>
    );
  }

  // Combined Struk + API Key section - one page, no tabs
  // Show struk form at top, API key generation below

  // Generate Struk + API Key together
  const generateBoth = async () => {
    setBusy(true); setError(null); setReceipt(null); setGeneratedKey(null); setGeneratedInfo(null);
    try {
      const t = token();
      // 1) Generate receipt
      const tokens = pkgId ? (pkgs?.find(p => p.id === pkgId)?.tokens_granted ?? 0) : (parseInt(manual) || 0);
      if (!tokens || tokens <= 0) { setError("Pilih paket atau isi token manual."); return; }
      
      const receiptRes = await fetch("/api/v1/admin/receipts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ 
          token_package_id: pkgId || undefined, 
          tokens: pkgId ? undefined : tokens,
          pos_reference_id: ref,
          cafe_id: user.cafe_id 
        }),
      });
      if (receiptRes.status === 401) { logout(); setError("Sesi habis — login ulang."); return; }
      if (!receiptRes.ok) {
        const err = await receiptRes.json().catch(() => ({}));
        setError(`Struk gagal: ${err.error?.message || receiptRes.status}`);
        return;
      }
      const receiptData = await receiptRes.json();
      setReceipt({ code: receiptData.code, claim_url: receiptData.claim_url, tokens: receiptData.tokens });
      setRef(`WEB-${Date.now()}`);

      // 2) Generate API key (optional - only if keyName is filled)
      if (keyName.trim()) {
        const keyRes = await fetch("/api/v1/admin/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ package_id: pkgId, name: keyName.trim(), cafe_id: user.cafe_id }),
        });
        if (keyRes.status === 401) { logout(); setError("Sesi habis."); return; }
        if (keyRes.status === 403) { setError("Tidak ada izin apikey.issue."); return; }
        if (keyRes.status === 402) { setError("Kuota cafe tidak cukup."); return; }
        if (keyRes.status === 409) { setError("Batas key tercapai."); return; }
        if (!keyRes.ok) {
          const err = await keyRes.json().catch(() => ({}));
          setError(`API Key gagal: ${err.error?.message || keyRes.status}`);
        } else {
          const keyData = await keyRes.json();
          setGeneratedKey(keyData.key);
          setGeneratedInfo({ prefix: keyData.api_key.key_prefix, quota: keyData.api_key.token_quota, expires_at: keyData.api_key.expires_at });
          setKeyName("");
          void loadMyKeysFromAPI();
        }
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-neutral-50 via-neutral-100 to-neutral-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950 print:bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:p-0">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">Kasir POS</h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Generate struk & API key untuk pelanggan</p>
          </div>
          {user && (
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Keluar
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm print:hidden dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* Package Selection with Toggle */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-neutral-100 bg-gradient-to-r from-primary/5 to-primary/10 px-6 py-4 dark:border-neutral-800 dark:from-primary/10 dark:to-primary/5">
              <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
                <svg className="h-5 w-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                Pilih Paket Token
              </h2>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { setMode("package"); setManual(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${mode === "package" ? "bg-primary text-white shadow-md" : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"}`}>
                  Paket
                </button>
                <button type="button" onClick={() => { setMode("manual"); setPkgId(""); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${mode === "manual" ? "bg-primary text-white shadow-md" : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"}`}>
                  Manual
                </button>
              </div>
            </div>
            <div className="p-6">
              {mode === "package" ? (
                !pkgs ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                      <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Memuat paket…
                    </div>
                  </div>
                ) : pkgs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-500">Belum ada paket aktif.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {pkgs.map((p) => (
                      <button key={p.id} type="button" onClick={() => setPkgId(p.id)} className={`group relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all ${pkgId === p.id ? "border-primary bg-primary/5 shadow-lg shadow-primary/20 dark:bg-primary/10" : "border-neutral-200 bg-white hover:border-primary/50 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-primary/50"}`}>
                        {pkgId === p.id && (
                          <div className="absolute right-3 top-3">
                            <svg className="h-5 w-5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          </div>
                        )}
                        <div className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-50">{p.name}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{idr(p.rupiah_amount)}</div>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-primary">{p.tokens_granted.toLocaleString("id-ID")}</span>
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">Token</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">Nominal Token Manual</label>
                  <input type="number" min={1} max={10000000} inputMode="numeric" value={manual} onChange={(e)=>setManual(e.target.value)} placeholder="cth. 1500" className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-900 dark:focus:border-primary" />
                </div>
              )}
            </div>
          </div>

          {/* Generate Section */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-neutral-100 bg-gradient-to-r from-emerald-50 to-emerald-100/50 px-6 py-4 dark:border-neutral-800 dark:from-emerald-950/30 dark:to-emerald-900/20">
              <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
                <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Generate Struk & API Key
              </h2>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">Isi nama pembeli. Kosongkan untuk tidak buat API key.</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Nama Pembeli (untuk struk)</span>
                  <input type="text" value={customerName} onChange={(e)=>setCustomerName(e.target.value)} placeholder="Nama pembeli / pelanggan" className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:border-primary" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Nama API Key (opsional)</span>
                  <input type="text" value={keyName} onChange={(e)=>setKeyName(e.target.value)} placeholder="Kosongkan untuk tidak buat API key" className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-800 dark:focus:border-primary" />
                </label>
              </div>
              <button onClick={generateBoth} disabled={busy || (!pkgId && !manual)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-hover px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">
                {busy ? (
                  <>
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Memproses…
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Generate
                  </>
                )}
              </button>

              {receipt && (
                <div className="mt-6 overflow-hidden rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-lg dark:border-emerald-800 dark:from-emerald-950/50 dark:to-emerald-900/30">
                  <div className="border-b border-emerald-200 bg-emerald-100 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-900/50">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-emerald-700 dark:text-emerald-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Struk Berhasil Dibuat</span>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Nama Pembeli</div>
                      <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">{customerName.trim() || "—"}</div>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Kode Struk</div>
                      <div className="mt-1 font-mono text-lg font-bold text-emerald-900 dark:text-emerald-100">{receipt.code}</div>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Jumlah Token</div>
                      <div className="mt-1 text-lg font-bold text-neutral-900 dark:text-neutral-50">{receipt.tokens.toLocaleString("id-ID")} Token</div>
                    </div>
                    <button onClick={done} className="w-full rounded-lg border-2 border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
                      Selesai — Buat Struk Baru
                    </button>
                  </div>
                </div>
              )}

              {generatedKey && (
                <div className="mt-4 overflow-hidden rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 shadow-lg dark:border-purple-800 dark:from-purple-950/50 dark:to-purple-900/30">
                  <div className="border-b border-purple-200 bg-purple-100 px-4 py-3 dark:border-purple-800 dark:bg-purple-900/50">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5 text-purple-700 dark:text-purple-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" /></svg>
                      <span className="text-sm font-semibold text-purple-800 dark:text-purple-200">API Key Terbuat</span>
                    </div>
                    <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">⚠️ Simpan sekarang — tidak akan ditampilkan lagi</p>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">API Key</div>
                      <div className="mt-1 break-all font-mono text-sm font-bold text-purple-900 dark:text-purple-100">{generatedKey}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Kuota</div>
                        <div className="mt-1 text-sm font-bold text-neutral-900 dark:text-neutral-50">{generatedInfo?.quota.toLocaleString("id-ID")} token</div>
                      </div>
                      <div className="rounded-lg bg-white p-3 dark:bg-neutral-900">
                        <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Expired</div>
                        <div className="mt-1 text-sm font-bold text-neutral-900 dark:text-neutral-50">{generatedInfo?.expires_at ? new Date(generatedInfo.expires_at).toLocaleDateString("id-ID") : "-"}</div>
                      </div>
                    </div>
                    <button onClick={copyKey} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-purple-300 bg-white px-4 py-2.5 text-sm font-semibold text-purple-800 transition-colors hover:bg-purple-50 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200 dark:hover:bg-purple-900/50">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      Salin API Key
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Key Saya */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-neutral-100 bg-gradient-to-r from-blue-50 to-blue-100/50 px-6 py-4 dark:border-neutral-800 dark:from-blue-950/30 dark:to-blue-900/20">
              <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
                <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" /></svg>
                API Key Saya
              </h2>
            </div>
            <div className="p-6">
              {keysLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3 text-sm text-neutral-500">
                    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Memuat…
                  </div>
                </div>
              ) : myKeys.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500">Belum ada key yang dibuat.</p>
              ) : (
                <div className="space-y-3">
                  {myKeys.map((k) => (
                    <div key={k.id} className="rounded-lg border border-neutral-200 bg-gradient-to-r from-neutral-50 to-white p-4 dark:border-neutral-700 dark:from-neutral-800 dark:to-neutral-800/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-neutral-200 px-2 py-0.5 font-mono text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">{k.key_prefix}…</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : k.status === 'expired' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'}`}>{k.status}</span>
                          </div>
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{k.name || "—"}</div>
                          <div className="flex items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
                            <span>Sisa: <span className="font-semibold text-neutral-900 dark:text-neutral-50">{(k.remaining ?? 0).toLocaleString("id-ID")}</span> / {k.token_quota.toLocaleString("id-ID")}</span>
                            <span>Expired: {k.expires_at ? new Date(k.expires_at).toLocaleDateString("id-ID") : "—"}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cek Status & Top-Up */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Cek Status */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-100 bg-gradient-to-r from-amber-50 to-amber-100/50 px-6 py-4 dark:border-neutral-800 dark:from-amber-950/30 dark:to-amber-900/20">
                <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
                  <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  Cek Status Key
                </h2>
              </div>
              <div className="p-6">
                <input type="text" value={checkInput} onChange={(e)=>setCheckInput(e.target.value)} placeholder="Tempel API key atau prefix pelanggan" className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-800" />
                <button onClick={checkStatus} disabled={checkBusy || !checkInput.trim()} className="mt-3 w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{checkBusy ? "Mengecek…" : "Cek Status"}</button>
                {checkResult && (
                  <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                    <div className="mb-2 font-mono text-xs text-neutral-600 dark:text-neutral-400">{checkResult.prefix}…</div>
                    <div className="space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
                      <div>Status: <span className="font-semibold">{checkResult.status}</span></div>
                      <div>Sisa: <span className="font-semibold">{checkResult.remaining.toLocaleString("id-ID")}</span> / {checkResult.token_quota.toLocaleString("id-ID")}</div>
                      <div>Expired: {checkResult.expires_at ? new Date(checkResult.expires_at).toLocaleDateString("id-ID") : "—"}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top-Up */}
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-100 bg-gradient-to-r from-indigo-50 to-indigo-100/50 px-6 py-4 dark:border-neutral-800 dark:from-indigo-950/30 dark:to-indigo-900/20">
                <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
                  <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                  Top-Up Key
                </h2>
              </div>
              <div className="p-6">
                <input type="text" value={topupInput} onChange={(e)=>setTopupInput(e.target.value)} placeholder="Tempel API key atau prefix pelanggan" className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-800" />
                <select value={topupPkgId} onChange={(e)=>setTopupPkgId(e.target.value)} className="mt-3 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-600 dark:bg-neutral-800">
                  <option value="">-- Pilih paket top-up (opsional) --</option>
                  {pkgs?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.tokens_granted.toLocaleString("id-ID")} token)</option>)}
                </select>
                <button onClick={topupKey} disabled={topupBusy || !topupInput.trim()} className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{topupBusy ? "Memproses…" : "Top-Up"}</button>
                {topupMsg && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{topupMsg}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
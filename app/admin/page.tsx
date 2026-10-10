"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Cafe = {
  id: string;
  slug: string;
  name: string;
  prepaid_token_balance: number;
  is_active: boolean;
  total_topup: number;
  total_tokens_granted: number;
  total_tokens_burned: number;
  active_workspaces: number;
};

// ponytail: halaman super admin murni client — baca access_token admin (hasil
// POST /api/v1/admin/auth/login) dari localStorage, render agregat dari
// endpoint (bukan localStorage). Guard peran di server: non-super_admin -> 403
// dari API, ditampilkan sebagai pesan akses ditolak.
const TOKEN_KEY = "ftai:admin:access_token";

export default function AdminCafesPage() {
  const [cafes, setCafes] = useState<Cafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");

  const load = useCallback(async (token: string) => {
    setError(null);
    setCafes(null);
    const res = await fetch("/api/v1/admin/cafes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      setError("Belum login sebagai super admin — tempel access_token di bawah.");
      return;
    }
    if (res.status === 403) {
      setError("Akses ditolak — halaman ini hanya untuk super_admin.");
      return;
    }
    if (!res.ok) {
      setError(`Gagal memuat daftar cafe (HTTP ${res.status}).`);
      return;
    }
    const data = (await res.json()) as { cafes: Cafe[] };
    setCafes(data.cafes);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) void load(saved);
    else setError("Belum login sebagai super admin — tempel access_token di bawah.");
  }, [load]);

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold">Super Admin — Daftar Cafe</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Kuota prepaid &amp; penggunaan API tiap cafe.
        </p>
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                localStorage.setItem(TOKEN_KEY, tokenInput.trim());
                void load(tokenInput.trim());
              }}
            >
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Tempel access_token super_admin"
                className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Simpan
              </button>
            </form>
          </div>
        )}
        {cafes && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {cafes.map((c) => (
              <Link
                key={c.id}
                href={`/admin/${c.id}`}
                className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.is_active
                        ? "bg-primary-soft text-primary-hover"
                        : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {c.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  /{c.slug} · total topup {c.total_topup.toLocaleString("id-ID")}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800">
                    <dt className="text-[11px] text-neutral-500">Sisa kuota</dt>
                    <dd className="text-base font-bold text-primary">{c.prepaid_token_balance.toLocaleString("id-ID")}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800">
                    <dt className="text-[11px] text-neutral-500">Token granted</dt>
                    <dd className="text-base font-bold">{c.total_tokens_granted.toLocaleString("id-ID")}</dd>
                  </div>
                  <div className="rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800">
                    <dt className="text-[11px] text-neutral-500">Workspace aktif</dt>
                    <dd className="text-base font-bold">{c.active_workspaces}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-neutral-500">
                  Token terpakai: {c.total_tokens_burned.toLocaleString("id-ID")} → lihat detail
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

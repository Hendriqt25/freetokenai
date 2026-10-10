"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Usage = {
  cafe: { id: string; slug: string; name: string; prepaid_token_balance: number; is_active: boolean };
  by_endpoint: Array<{ endpoint_type: string; requests: number; tokens_burned: number }>;
  by_day: Array<{ day: string; requests: number; tokens_burned: number }>;
};

// ponytail: detail cafe super admin — tabel per endpoint + tren harian sebagai
// bar CSS (tanpa lib chart). Data dari endpoint, token dari localStorage
// (kunci sama dengan halaman list).
const TOKEN_KEY = "ftai:admin:access_token";

export default function AdminCafeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError("Belum login sebagai super admin — kembali ke /admin untuk menempel token.");
      return;
    }
    fetch(`/api/v1/admin/cafes/${id}/usage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Sesi habis — login ulang lalu tempel token baru di /admin.");
        if (res.status === 403) throw new Error("Akses ditolak — hanya super_admin.");
        if (res.status === 404) throw new Error("Cafe tidak ditemukan.");
        if (!res.ok) throw new Error(`Gagal memuat usage (HTTP ${res.status}).`);
        setData((await res.json()) as Usage);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  const maxDay = Math.max(1, ...((data?.by_day ?? []).map((d) => d.tokens_burned)));

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin" className="text-sm font-medium text-primary hover:underline">
          ← Kembali ke daftar cafe
        </Link>
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}
        {data && (
          <>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h1 className="text-2xl font-bold">{data.cafe.name}</h1>
              <p className="text-xs text-neutral-500">/{data.cafe.slug}</p>
              <p className="mt-3 text-sm">
                Sisa kuota prepaid:{" "}
                <span className="text-lg font-bold text-primary">
                  {data.cafe.prepaid_token_balance.toLocaleString("id-ID")}
                </span>{" "}
                token
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">Penggunaan per endpoint</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="pb-2">Endpoint</th>
                    <th className="pb-2 text-right">Request</th>
                    <th className="pb-2 text-right">Token terpakai</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_endpoint.map((r) => (
                    <tr key={r.endpoint_type} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-2 font-medium">{r.endpoint_type}</td>
                      <td className="py-2 text-right">{r.requests.toLocaleString("id-ID")}</td>
                      <td className="py-2 text-right font-semibold text-primary">
                        {r.tokens_burned.toLocaleString("id-ID")}
                      </td>
                    </tr>
                  ))}
                  {data.by_endpoint.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-neutral-500">
                        Belum ada penggunaan tercatat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="font-semibold">Tren harian (30 hari)</h2>
              <div className="mt-3 space-y-2">
                {data.by_day.map((d) => (
                  <div key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs text-neutral-500">{d.day}</span>
                    <div className="h-5 min-w-0 flex-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div
                        className="h-5 rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (d.tokens_burned / maxDay) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right font-medium">
                      {d.tokens_burned.toLocaleString("id-ID")}
                    </span>
                  </div>
                ))}
                {data.by_day.length === 0 && (
                  <p className="py-2 text-center text-sm text-neutral-500">Belum ada data harian.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

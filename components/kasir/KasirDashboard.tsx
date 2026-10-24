"use client";

import { useEffect, useRef, useState } from "react";

type Dashboard = {
  cafe: { id: string; name: string; token_balance: number; is_active: boolean };
  summary: { today_tokens: number; today_requests: number; week_tokens: number; week_requests: number };
  by_day: { day: string; tokens: number }[];
  by_endpoint: { endpoint_type: string; requests: number; tokens: number }[];
  recent: {
    created_at: string; endpoint_type: string | null; model_id: string;
    tokens_burned: number; status: string; key_prefix: string | null;
  }[];
  keys: {
    key_prefix: string; name: string | null; token_quota: number; tokens_used: number;
    remaining: number; status: string; last_used_at: string | null;
  }[];
  transactions: { type: string; amount: number; balance_after: number; note: string | null; created_at: string }[];
  generated_at: string;
};

const n = (v: number) => v.toLocaleString("id-ID");
const when = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("id-ID", { weekday: "short" });

const TYPE_LABEL: Record<string, string> = { topup: "Top-up", reserve: "Pemakaian", refund: "Refund", adjustment: "Koreksi" };

export default function KasirDashboard({ authFetch }: { authFetch: (path: string, init?: RequestInit) => Promise<Response> }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(authFetch);
  fetchRef.current = authFetch;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetchRef.current("/api/v1/kasir/dashboard");
        if (!res.ok) {
          if (alive) setError(res.status === 401 ? "Sesi habis." : `Gagal memuat dashboard (HTTP ${res.status}).`);
          return;
        }
        const json = (await res.json()) as Dashboard;
        if (!alive) return;
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Tidak dapat memuat dashboard.");
      }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!data) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        {error ?? "Memuat dashboard cafe..."}
      </div>
    );
  }

  const maxDay = Math.max(1, ...data.by_day.map((d) => d.tokens));
  const activeKeys = data.keys.filter((k) => k.status === "active").length;
  const lowBalance = data.cafe.token_balance < 10_000;

  return (
    <section className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">Dashboard {data.cafe.name}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Saldo & pemakaian otomatis diperbarui tiap 15 detik · terakhir {when(data.generated_at)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${data.cafe.is_active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"}`}>
          {data.cafe.is_active ? "Cafe aktif" : "Cafe nonaktif"}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {error} Menampilkan data terakhir.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`rounded-2xl border p-5 shadow-sm ${lowBalance ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${lowBalance ? "text-amber-600 dark:text-amber-400" : "text-primary"}`}>Sisa token cafe</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{n(data.cafe.token_balance)}</p>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{lowBalance ? "Saldo menipis — minta top-up ke admin." : "Cukup untuk generate struk."}</p>
        </div>
        <Stat label="Pemakaian hari ini" value={n(data.summary.today_tokens)} sub={`${n(data.summary.today_requests)} request`} />
        <Stat label="Pemakaian 7 hari" value={n(data.summary.week_tokens)} sub={`${n(data.summary.week_requests)} request`} />
        <Stat label="API key aktif" value={n(activeKeys)} sub={`dari ${n(data.keys.length)} key cafe`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Pemakaian 7 hari terakhir</p>
          <div className="mt-4 flex h-20 items-end gap-2">
            {data.by_day.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${n(d.tokens)} token`}>
                <div
                  className="w-full rounded-t bg-primary/70 dark:bg-primary/60"
                  style={{ height: `${Math.max(3, Math.round((d.tokens / maxDay) * 64))}px` }}
                />
                <span className="text-[10px] text-neutral-400">{dayLabel(d.day)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.by_endpoint.length === 0 && <span className="text-xs text-neutral-400">Belum ada pemakaian.</span>}
            {data.by_endpoint.map((e) => (
              <span key={e.endpoint_type} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {e.endpoint_type ?? "lain"}: {n(e.tokens)} token · {n(e.requests)}x
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Riwayat saldo terakhir</p>
          {data.transactions.length === 0 ? (
            <p className="mt-4 text-xs text-neutral-400">Belum ada transaksi saldo.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
              {data.transactions.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-800 dark:text-neutral-100">{TYPE_LABEL[t.type] ?? t.type}</p>
                    <p className="truncate text-[11px] text-neutral-400">
                      {when(t.created_at)}{t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold tabular-nums ${t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"}`}>
                      {t.amount >= 0 ? "+" : "−"}{n(Math.abs(t.amount))}
                    </p>
                    <p className="text-[10px] text-neutral-400">saldo {n(t.balance_after)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Riwayat pemakaian API</p>
          <span className="text-[11px] text-neutral-400">10 terakhir</span>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-4 py-6 text-xs text-neutral-400">Belum ada pemakaian API.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Waktu</th>
                  <th className="px-4 py-2 font-medium">Endpoint</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Key</th>
                  <th className="px-4 py-2 text-right font-medium">Token</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.recent.map((r, i) => (
                  <tr key={i} className="text-neutral-700 dark:text-neutral-200">
                    <td className="whitespace-nowrap px-4 py-2 text-neutral-500 dark:text-neutral-400">{when(r.created_at)}</td>
                    <td className="px-4 py-2 capitalize">{r.endpoint_type ?? "—"}</td>
                    <td className="px-4 py-2">{r.model_id}</td>
                    <td className="px-4 py-2 font-mono text-[11px]">{r.key_prefix ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{n(r.tokens_burned)}</td>
                    <td className="px-4 py-2">
                      <span className={r.status === "success" ? "text-emerald-600 dark:text-emerald-400" : r.status === "refunded" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Sisa token per API key</p>
          <span className="text-[11px] text-neutral-400">{data.keys.length} key</span>
        </div>
        {data.keys.length === 0 ? (
          <p className="px-4 py-6 text-xs text-neutral-400">Belum ada API key untuk cafe ini.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto text-sm dark:divide-neutral-800">
            {data.keys.map((k) => {
              const pct = k.token_quota > 0 ? Math.min(100, Math.round((k.remaining / k.token_quota) * 100)) : 0;
              return (
                <li key={k.key_prefix} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-800 dark:text-neutral-100">{k.name || k.key_prefix}</p>
                      <p className="font-mono text-[11px] text-neutral-400">{k.key_prefix} · {k.status}</p>
                    </div>
                    <p className="shrink-0 text-right text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{n(k.remaining)}</span> / {n(k.token_quota)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div className={`h-full rounded-full ${pct <= 20 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{value}</p>
      <p className="mt-1 text-[11px] text-neutral-400">{sub}</p>
    </div>
  );
}

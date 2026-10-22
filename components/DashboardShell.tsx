"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

// Pastikan sesi customer sudah ada SEBELUM child halaman fetch profil/workspace.
// Di dev, GET /api/v1/auth/me otomatis membuat sesi dev@example.com kalau belum
// ada customer session. Flag modul mencegah spinner saat navigasi SPA berikutnya.
let sessionChecked = false;

// ponytail: satu shell drawer untuk semua halaman dashboard — hemat 5 duplikat
// Sidebar+TopBar. Mobile = drawer overlay (ala ChatGPT), lg+ = permanen.
export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(sessionChecked);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (sessionChecked) return;
    let alive = true;
    void fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .catch(() => null)
      .finally(() => {
        sessionChecked = true;
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!ready) return <DashboardSkeleton />;

  return (
    <div className="flex h-dvh overflow-hidden bg-white dark:bg-neutral-950">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}
      <Sidebar open={open} onClose={close} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="flex min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

// ponytail: skeleton bentuk akhir dashboard (sidebar + topbar + konten) agar
// transisi sesi terasa instan, bukan spinner. Warna netral = tema terang/gelap.
function DashboardSkeleton() {
  const bar = "rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse";
  return (
    <div
      role="status"
      aria-label="Memuat dasbor"
      aria-busy="true"
      className="flex h-dvh overflow-hidden bg-white dark:bg-neutral-950"
    >
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 p-4 lg:flex dark:border-neutral-800">
        <div className="flex items-center gap-2 px-2 pb-4">
          <div className={`h-5 w-5 ${bar}`} />
          <div className={`h-4 w-24 ${bar}`} />
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`h-8 w-full ${bar}`} />
          ))}
        </div>
        <div className="mt-6 px-2">
          <div className={`mb-2 h-3 w-16 ${bar}`} />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`mb-1.5 h-7 w-full ${bar}`} />
          ))}
        </div>
      </aside>

      {/* Area utama */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 md:px-6 dark:border-neutral-800">
          <div className={`h-7 w-7 rounded-lg lg:hidden ${bar}`} />
          <div className={`hidden h-4 w-40 lg:block ${bar}`} />
          <div className={`h-8 w-28 rounded-full ${bar}`} />
        </header>

        {/* Konten */}
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-hidden px-4 py-6 md:px-6 md:py-8">
          <div className={`mb-6 h-7 w-2/3 ${bar}`} />
          <div className="mb-8 flex flex-col gap-2">
            <div className={`h-4 w-full ${bar}`} />
            <div className={`h-4 w-11/12 ${bar}`} />
            <div className={`h-4 w-9/12 ${bar}`} />
          </div>
          <div className="mb-8 flex justify-end">
            <div className={`h-16 w-2/3 rounded-2xl ${bar}`} />
          </div>
          <div className="mb-8 flex flex-col gap-2">
            <div className={`h-4 w-10/12 ${bar}`} />
            <div className={`h-4 w-full ${bar}`} />
            <div className={`h-4 w-8/12 ${bar}`} />
          </div>
          <div className={`mt-auto h-12 w-full rounded-2xl ${bar}`} />
        </main>
      </div>
    </div>
  );
}

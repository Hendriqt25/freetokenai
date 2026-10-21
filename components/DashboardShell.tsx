"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 size={26} className="animate-spin text-primary" />
      </div>
    );
  }

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

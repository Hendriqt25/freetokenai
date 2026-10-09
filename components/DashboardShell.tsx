"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

// ponytail: satu shell drawer untuk semua halaman dashboard — hemat 5 duplikat
// Sidebar+TopBar. Mobile = drawer overlay (ala ChatGPT), lg+ = permanen.
export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

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

"use client";

import { useEffect, useState } from "react";
import { Menu, Ticket } from "lucide-react";
import { fetchWorkspace } from "@/lib/settings";
import ThemeToggle from "./ThemeToggle";

export default function TopBar({ onMenu }: { onMenu?: () => void }) {
  // ponytail: sisa Token dari DB; fallback lokal bila API 5xx (di dalam fetchWorkspace).
  const [balance, setBalance] = useState(1500);
  useEffect(() => {
    fetchWorkspace().then((w) => setBalance(w.tokenBalance));
  }, []);
  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3.5 md:px-8 dark:border-neutral-800">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Buka menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100 lg:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Menu size={18} />
        </button>
        <span className="text-sm font-medium text-neutral-900 dark:text-white">
          Token Anda
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs font-medium text-primary dark:border-neutral-700">
          <Ticket size={13} />
          {balance.toLocaleString("id-ID")}
        </span>
      </div>
      <ThemeToggle />
    </header>
  );
}

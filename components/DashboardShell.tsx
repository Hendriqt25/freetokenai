"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, KeyRound, Loader2, Sparkles } from "lucide-react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { notifySettingsChanged, notifyWorkspaceChanged } from "@/lib/settings";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleLogout = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener("auth_logout", handleLogout);
    return () => {
      window.removeEventListener("auth_logout", handleLogout);
    };
  }, [checkAuth]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!ready) return <DashboardSkeleton />;

  return (
    <div className="relative flex h-dvh overflow-hidden bg-white dark:bg-neutral-950">
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

      {/* Modal Blocking jika user belum memiliki sesi / belum validasi API Key */}
      {!isAuthenticated && (
        <ApiKeyPromptModal
          onSuccess={() => {
            setIsAuthenticated(true);
            notifySettingsChanged();
            notifyWorkspaceChanged();
          }}
        />
      )}
    </div>
  );
}

function ApiKeyPromptModal({ onSuccess }: { onSuccess: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const key = apiKey.trim();
    if (!key) {
      setError("Masukkan API key terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/user/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Validasi API key gagal.");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 md:p-8 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
            <Sparkles size={32} />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
            Selamat Datang di FreeTokenAI
          </h2>
          <p className="mt-2 text-xs md:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            Silakan masukkan <strong>API Key</strong> dari kasir cafe (tercantum pada struk belanja Anda) untuk mengakses AI Chat, Gambar, dan Video.
          </p>
        </div>

        <form onSubmit={handleValidate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound size={14} className="text-primary" />
              API Key Anda
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rst_live_..."
              autoFocus
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-4 py-3 text-sm shadow-inner transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-800 dark:text-white"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !apiKey.trim()}
            className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Memvalidasi Kunci...</span>
              </>
            ) : (
              "Validasi & Masuk ke Dashboard"
            )}
          </button>

          <div className="pt-2 text-center text-[11px] text-neutral-400">
            Belum punya kunci? Pesan kopi / makanan di kasir dan minta struk API Key AI.
          </div>
        </form>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const bar = "rounded-md bg-neutral-200 dark:bg-neutral-800 animate-pulse";
  return (
    <div
      role="status"
      aria-label="Memuat dasbor"
      aria-busy="true"
      className="flex h-dvh overflow-hidden bg-white dark:bg-neutral-950"
    >
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 md:px-6 dark:border-neutral-800">
          <div className={`h-7 w-7 rounded-lg lg:hidden ${bar}`} />
          <div className={`hidden h-4 w-40 lg:block ${bar}`} />
          <div className={`h-8 w-28 rounded-full ${bar}`} />
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 overflow-hidden px-4 py-6 md:px-6 md:py-8">
          <div className={`mb-4 h-6 w-48 ${bar}`} />
          <div className={`mb-2 h-4 w-full ${bar}`} />
          <div className={`h-4 w-3/4 ${bar}`} />
        </main>
      </div>
    </div>
  );
}

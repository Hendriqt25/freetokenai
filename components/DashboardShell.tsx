"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, KeyRound, Loader2, Sparkles } from "lucide-react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import Link from "next/link";
import { notifySettingsChanged, notifyWorkspaceChanged } from "@/lib/settings";
import { useT } from "@/lib/i18n";

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

      {/* ponytail: shell dirender duluan; modal tunggu cek auth supaya tak nge-flash */}
      {ready && !isAuthenticated && (
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
  const { t } = useT();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleValidate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const key = apiKey.trim();
    if (!key) {
      setError(t("auth.empty"));
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
        throw new Error(data?.error?.message || t("auth.failed"));
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 md:p-8 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 modal-enter">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-inner">
            <Sparkles size={32} />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">
            {t("auth.welcome")}
          </h2>
          <p className="mt-2 text-xs md:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {t("auth.desc")}
          </p>
        </div>

        <form onSubmit={handleValidate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound size={14} className="text-primary" />
              {t("auth.yourKey")}
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
                <span>{t("auth.validating")}</span>
              </>
            ) : (
              t("auth.validate")
            )}
          </button>

          <div className="pt-2 text-center text-[11px] text-neutral-400">
            {t("auth.needKey")}
            <div className="mt-2">
              {t("auth.staff")}{" "}
              <Link href="/kasir" className="font-semibold text-primary hover:underline">
                {t("auth.staffLogin")}
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

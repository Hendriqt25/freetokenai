'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Coins,
  KeyRound,
  Loader2,
  MessageSquare,
  Sparkles,
  Store,
  Calendar,
  ArrowRight,
  ShieldCheck,
  RotateCw,
} from 'lucide-react';
import { useT } from '@/lib/i18n';

interface KeyInfo {
  id: string;
  prefix: string;
  name: string | null;
  status: 'active' | 'expired' | 'revoked' | 'exhausted' | 'expiring' | 'disabled';
  remaining: number;
  token_quota: number;
  tokens_used: number;
  expires_at: string | null;
  cafe_id: string | null;
}

interface WorkspaceInfo {
  id: string;
  token_balance: number;
  expires_at: string | null;
}

interface ValidatedKey {
  key: KeyInfo;
  workspace: WorkspaceInfo;
}

interface ExistingBalance {
  workspaceId: string;
  remaining: number;
  expiresAt: string | null;
  isExpired: boolean;
  isExhausted: boolean;
  cafeName: string | null;
  user: { id: string; name: string | null };
}

export default function UserDashboard() {
  const { t, locale } = useT();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [keyData, setKeyData] = useState<ValidatedKey | null>(null);
  const [existingBalance, setExistingBalance] = useState<ExistingBalance | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/v1/user/balance', { credentials: 'include', cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as ExistingBalance;
          if (data.remaining > 0 && !data.isExpired) {
            setExistingBalance(data);
            setShowModal(false);
            setCheckingAuth(false);
            return;
          }
        }
      } catch {}
      // Jika tidak ada session atau expired/exhausted, tampilkan modal
      setShowModal(true);
      setCheckingAuth(false);
    }

    checkSession();
  }, []);

  const validateKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setError(t('auth.empty'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/user/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message || t('auth.failed'));
        return;
      }

      setKeyData(data);
      setExistingBalance(null);
      setShowModal(false);
      setApiKeyInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) validateKey();
  };

  const changeKey = () => {
    setShowModal(true);
    setApiKeyInput('');
    setError('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback('Tersalin!');
      setTimeout(() => setCopyFeedback(''), 2000);
    });
  };

  // State: Loading cek session
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-neutral-500">{t('user.checking')}</p>
        </div>
      </div>
    );
  }

  // Modal blocking jika belum input / validasi key
  if (showModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 md:p-8 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
          <div className="mb-6 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound size={28} />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{t('user.enterKey')}</h1>
            <p className="mt-2 text-xs md:text-sm text-neutral-600 dark:text-neutral-400">
              {t('user.enterKeyDesc')}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                {t('user.cafeKey')}
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={handleKeyInputKeyDown}
                placeholder="rst_live_..."
                autoFocus
                className="w-full rounded-xl border border-neutral-300 bg-neutral-50/50 px-4 py-3 text-sm shadow-inner transition-all focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-800"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={validateKey}
              disabled={loading || !apiKeyInput.trim()}
              className="w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('user.validating')}</span>
                </>
              ) : (
                t('user.validateOpen')
              )}
            </button>

            <p className="text-center text-[11px] text-neutral-400">
              {t('user.keyReceipt')} <code>rst_live_...</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Sisa token & expires
  const remainingTokens = keyData ? keyData.workspace.token_balance : (existingBalance?.remaining ?? 0);
  const expiresAt = keyData ? keyData.workspace.expires_at : (existingBalance?.expiresAt ?? null);
  const cafeTitle = existingBalance?.cafeName || 'Cafe Partner';

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                <ShieldCheck size={12} />
                {t('user.activeSession')}
              </span>
              {cafeTitle && (
                <span className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                  <Store size={12} />
                  {cafeTitle}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-50 mt-1">
              {t('user.dashboard')}
            </h1>
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
              {t('user.subtitle')}
            </p>
          </div>

          <button
            onClick={changeKey}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 transition"
          >
            <RotateCw size={14} />
            <span>{t('user.changeKey')}</span>
          </button>
        </div>

        {/* Saldo Token Card */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800">
          <div className="border-b border-neutral-100 bg-gradient-to-r from-emerald-500/10 to-transparent px-6 py-4 dark:border-neutral-800">
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
              <Coins className="text-emerald-500" size={18} />
              {t('user.balanceTitle')}
            </h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('user.remaining')}</div>
                <div className="mt-2 text-3xl md:text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  {remainingTokens.toLocaleString(locale)}
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">{t('user.ready')}</div>
              </div>

              <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {t('user.validity')}
                  </div>
                  <div className="mt-2 text-base font-bold text-neutral-800 dark:text-neutral-200">
                    {expiresAt ? new Date(expiresAt).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }) : t('user.unlimited')}
                  </div>
                </div>
                <div className="text-[11px] text-neutral-400 mt-2">
                  {t('user.afterDate')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Akses Chat Banner */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-hover p-6 md:p-8 text-white shadow-xl shadow-primary/20">
          <div className="max-w-md space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-sm">
              <Sparkles size={14} />
              {t('user.workspaceReady')}
            </div>
            <h2 className="text-2xl font-bold">{t('user.startChat')}</h2>
            <p className="text-xs md:text-sm text-white/80 leading-relaxed">
              {t('user.startChatDesc')}
            </p>
          </div>

          <div className="mt-6">
            <Link
              href="/dashboard/chat"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-primary shadow-md hover:bg-neutral-100 transition-all"
            >
              <MessageSquare size={18} />
              <span>{t('user.openChat')}</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

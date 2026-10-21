"use client";

import {
  ChevronDown,
  ChevronUp,
  Code2,
  ImageIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Trash2,
  VideoIcon,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAT_CHANGED, CHAT_NEW, deleteChatSession, hydrateSessions, listChatSessions, type ChatSession } from "@/lib/chat-history";
import { CHAT_JOBS_CHANGED } from "@/lib/chat-jobs";
import { DEFAULT_PROFILE, fetchProfile, getProfile, SETTINGS_CHANGED, type UserProfile } from "@/lib/settings";

const navItems = [
  { label: "Bikin Gambar", icon: ImageIcon, href: "/dashboard/image" },
  { label: "Bikin Video", icon: VideoIcon, href: "/dashboard/video" },
  { label: "Developer API", icon: Code2, href: "/dashboard/developer" },
];


export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  // ponytail: initial state WAJIB sama persis dengan output SSR (mockUser),
  // bukan hasil localStorage — kalau beda, hydration gagal ("SA" vs "TR").
  // Nilai asli dipasang di useEffect sync() di bawah, setelah hydrate.
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const router = useRouter();
  const pathname = usePathname();

  // ponytail: "Terbaru" = chat_sessions per-user dari DB (PRD 4.5/5.3).
  // sync() baca cache; hydrateSessions() tarik DB lalu notify -> sync jalan lagi.
  useEffect(() => {
    const sync = () => {
      setSessions(listChatSessions());
      setProfile(getProfile());
    };
    sync();
    void hydrateSessions();
    fetchProfile().then(setProfile);
    window.addEventListener(CHAT_CHANGED, sync);
    // job chat selesai -> judul/updated_at berubah di DB, muat ulang
    window.addEventListener(CHAT_JOBS_CHANGED, () => void hydrateSessions());
    window.addEventListener(SETTINGS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHAT_CHANGED, sync);
      window.removeEventListener(SETTINGS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // ponytail: Obrolan Baru = pindah ke /dashboard (halaman chat kosong).
  // Kalau sudah di sana, reset draft via event.
  function newChat() {
    onClose?.();
    if (pathname === "/dashboard") window.dispatchEvent(new Event(CHAT_NEW));
    else router.push("/dashboard");
  }

  function removeSession(id: string) {
    void deleteChatSession(id);
    if (pathname === `/dashboard/chat/${id}`) router.push("/dashboard");
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-full shrink-0 flex-col overflow-x-hidden border-r border-neutral-200 bg-neutral-50 transition-transform duration-200 ease-in-out dark:border-neutral-800 dark:bg-neutral-900 lg:static lg:z-auto lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "w-64 lg:w-16" : "w-64"}`}
    >
      {/* Satu scroll area untuk seluruh sidebar (logo sampai riwayat chat) —
          scrollbar-nya jadi satu, menyatu dengan tepi sidebar, bukan kotak
          scroll kecil terpisah di tengah. */}
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          <div
            className={`flex items-center justify-center gap-2 px-4 ${
              collapsed ? "pt-6 pb-2" : "py-6"
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
              <Image src="/logo-ftk.svg" alt="FreeTokenAI" width={20} height={18} priority />
            </div>
            {!collapsed && (
              <>
                <span className="font-sf flex-1 truncate text-lg font-semibold text-neutral-900 dark:text-white">
                  FreeTokenAI
                </span>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Kecilkan sidebar"
                  className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200/60 lg:flex dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <PanelLeftClose size={16} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup menu"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200/60 lg:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <X size={16} />
                </button>
              </>
            )}
          </div>

          {collapsed && (
            <div className="hidden justify-center px-4 pb-2 lg:flex">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Perbesar sidebar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <PanelLeftOpen size={16} />
              </button>
            </div>
          )}

          <div className="px-4">
            <button
              type="button"
              onClick={newChat}
              title={collapsed ? "Obrolan Baru" : undefined}
              className={`flex w-full items-center rounded-xl bg-primary py-2 text-sm font-medium text-white transition hover:bg-primary-hover ${
                collapsed ? "justify-center px-0" : "gap-3 px-2.5"
              }`}
            >
              <Plus size={16} className="shrink-0" />
              {!collapsed && "Obrolan Baru"}
            </button>
          </div>

          <nav className="mt-3 flex flex-col gap-1 px-4">
            {navItems.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                onClick={onClose}
                title={collapsed ? label : undefined}
                className={`flex items-center rounded-lg text-[13px] text-neutral-700 transition hover:bg-neutral-200/60 dark:text-neutral-200 dark:hover:bg-neutral-800 ${
                  collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && label}
              </a>
            ))}
          </nav>

          {!collapsed && (
            <div className="mt-6 flex flex-col px-4 pb-8">
              <button
                type="button"
                onClick={() => setHistoryOpen((open) => !open)}
                className="flex items-center justify-between px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
              >
                Terbaru
                {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {historyOpen && (
                sessions.length === 0 ? (
                  <p className="mt-1 px-3 py-2 text-[13px] text-neutral-400 dark:text-neutral-500">
                    Belum ada obrolan.
                  </p>
                ) : (
                <ul className="mt-1 space-y-0.5">
                  {sessions.map((s) => {
                    const active = pathname === `/dashboard/chat/${s.id}`;
                    return (
                      <li key={s.id} className="group flex items-center gap-1">
                        <Link
                          href={`/dashboard/chat/${s.id}`}
                          onClick={onClose}
                          className={`block min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-[13px] transition hover:bg-neutral-200/60 dark:hover:bg-neutral-800 ${
                            active
                              ? "bg-neutral-200/60 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-white"
                              : "text-neutral-700 dark:text-neutral-200"
                          }`}
                          title={s.title}
                        >
                          {s.title}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeSession(s.id)}
                          aria-label={`Hapus ${s.title}`}
                          title="Hapus obrolan"
                          className="shrink-0 rounded-md p-1.5 text-neutral-400 opacity-0 transition hover:bg-neutral-200/60 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-neutral-800"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                )
              )}
            </div>
          )}
        </div>

        {/* Fade tetap di posisinya (tidak ikut scroll) tepat di perbatasan
            dengan footer "Pengaturan" — item yang lewat di baliknya menghilang
            secara gradient, bukan terpotong tegas. */}
        {!collapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-neutral-50 dark:to-neutral-900" />
        )}
      </div>

      {/* Footer fixed: Pengaturan + profil, selalu terlihat, di luar area scroll. */}
      <div className="px-4 py-3">
        <a
          href="/dashboard/settings"
          title={collapsed ? "Pengaturan" : undefined}
          className={`flex items-center rounded-lg text-[13px] text-neutral-700 transition hover:bg-neutral-200/60 dark:text-neutral-200 dark:hover:bg-neutral-800 ${
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && "Pengaturan"}
        </a>

        <div className="my-2 border-t border-neutral-200 dark:border-neutral-800" />

        <button
          type="button"
          title={collapsed ? profile.name : undefined}
          className={`flex w-full items-center rounded-lg border border-neutral-200 py-1.5 text-left transition hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800 ${
            collapsed ? "justify-center px-0" : "gap-2.5 px-3"
          }`}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-xs font-semibold text-primary dark:bg-neutral-700 dark:text-white">
            {profile.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-neutral-900 dark:text-white">
                  {profile.name}
                </p>
                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                  {profile.contact}
                </p>
              </div>
              <ChevronUp size={14} className="shrink-0 text-neutral-400" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

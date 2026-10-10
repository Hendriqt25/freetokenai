"use client";

import { useEffect, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import {
  deleteChatSession,
  getChatMessages,
  listChatSessions,
} from "@/lib/chat-history";
import { currentUserId } from "@/lib/current-user";
import { loadMediaHistory } from "@/lib/media-history";
import {
  fetchDevices,
  fetchProfile,
  fetchWorkspace,
  getAppSettings,
  getProfile,
  listDevices,
  revokeDeviceRemote,
  saveAppSettings,
  saveProfileRemote,
  type Device,
  type WorkspaceInfo,
} from "@/lib/settings";

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>
      <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">{desc}</p>
      {children}
    </section>
  );
}

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-primary sm:max-w-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-white";
const btnPrimary =
  "rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover";
const btnGhost =
  "rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800";
const btnDanger =
  "rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950";

export default function SettingsPanel() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [lang, setLang] = useState<"id" | "en">("id");
  const [isDark, setIsDark] = useState(false);
  const [saved, setSaved] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  useEffect(() => {
    setName(getProfile().name);
    setContact(getProfile().contact);
    setDevices(listDevices());
    // ponytail: tampilkan data DB; fallback lokal bila API 5xx (di dalam fetch*).
    fetchProfile().then((p) => { setName(p.name); setContact(p.contact); });
    fetchDevices().then(setDevices);
    fetchWorkspace().then(setWorkspace);
    const app = getAppSettings();
    setModel(app.defaultModel);
    setLang(app.language);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function flash(msg: string) {
    setSaved(msg);
    window.setTimeout(() => setSaved(""), 2000);
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // abaikan
    }
  }

  function changeLang(v: "id" | "en") {
    setLang(v);
    saveAppSettings({ defaultModel: model, language: v });
    try {
      document.documentElement.lang = v;
    } catch {
      // abaikan
    }
  }

  function changeModel(v: string) {
    setModel(v);
    saveAppSettings({ defaultModel: v, language: lang });
    flash("Model default disimpan.");
  }

  function wipeChats() {
    if (!window.confirm("Hapus semua riwayat obrolan?")) return;
    listChatSessions().forEach((s) => void deleteChatSession(s.id));
    flash("Semua riwayat obrolan dihapus.");
  }

  function downloadData() {
    const uid = currentUserId();
    const sessions = listChatSessions().map((s) => ({
      ...s,
      messages: getChatMessages(s.id),
    }));
    const data = {
      profile: getProfile(),
      settings: getAppSettings(),
      devices: listDevices(),
      chat_sessions: sessions,
      media: {
        image: loadMediaHistory("image"),
        video: loadMediaHistory("video"),
      },
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dataku-${uid.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function eraseData() {
    if (!window.confirm("Hapus semua dataku di perangkat ini? Tidak bisa dibatalkan.")) return;
    const uid = currentUserId();
    try {
      const gone: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.includes(uid) || k.startsWith("ftai:media:") || k.startsWith("ftai:chat:"))) gone.push(k);
      }
      gone.forEach((k) => localStorage.removeItem(k));
    } catch {
      // abaikan
    }
    setDevices(listDevices());
    flash("Data di perangkat ini dihapus.");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto px-4 py-6 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 md:text-2xl dark:text-white">Pengaturan</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Profil, perangkat, workspace, dan preferensimu.
        </p>
      </div>

      {saved && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {saved}
        </p>
      )}

      <Section title="Profil" desc="Nama & kontak — tampil di kartu profil sidebar (users.name, PRD 5.3).">
        <div className="flex flex-col gap-2.5">
          <input aria-label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" className={inputCls} />
          <input aria-label="No. WA / email" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="No. WA / email" className={inputCls} />
          <div>
            <button
              type="button"
              className={btnPrimary}
              onClick={async () => {
                const next = await saveProfileRemote({ name: name.trim() || "Tanpa Nama", contact: contact.trim(), avatarUrl: null });
                setName(next.name);
                setContact(next.contact);
                flash("Profil disimpan.");
              }}
            >
              Simpan Profil
            </button>
          </div>
        </div>
      </Section>

      <Section title="Perangkat" desc="Maks 2 device aktif — device ke-3 menendang yang terlama (PRD Section 2).">
        {devices.length === 0 ? (
          <p className="text-sm text-neutral-400">Tidak ada perangkat.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-neutral-900 dark:text-white">
                    {d.label} {d.current && "· ini"}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    Aktif {new Date(d.lastActive).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                  </span>
                </span>
                {!d.current && (
                  <button type="button" className={btnDanger} onClick={async () => setDevices(await revokeDeviceRemote(d.id))}>
                    Cabut
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Workspace" desc="Sisa Token & masa aktif — read-only (GET /api/v1/workspace, PRD 7.4).">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-neutral-200 px-3 py-1 font-medium text-primary dark:border-neutral-700">
            {(workspace?.tokenBalance ?? 1500).toLocaleString("id-ID")} Token
          </span>
          <span className="rounded-full border border-neutral-200 px-3 py-1 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
            Aktif Sampai {workspace?.expiresAtLabel ?? "…"}
          </span>
        </div>
      </Section>

      <Section title="Tampilan" desc="Dark mode manual wajib didukung (PRD 4.5).">
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" className={btnGhost} onClick={toggleTheme}>
            {isDark ? "Mode Terang" : "Mode Gelap"}
          </button>
          <select aria-label="Bahasa" value={lang} onChange={(e) => changeLang(e.target.value as "id" | "en")} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-white">
            <option value="id">Bahasa Indonesia</option>
            <option value="en">English</option>
          </select>
        </div>
      </Section>

      <Section title="Chat" desc="Model default untuk obrolan baru + kelola riwayat (PRD 7.4).">
        <div className="flex flex-wrap items-center gap-2.5">
          <select aria-label="Model default" value={model} onChange={(e) => changeModel(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950 dark:text-white">
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button type="button" className={btnDanger} onClick={wipeChats}>
            Hapus Semua Riwayat
          </button>
        </div>
      </Section>

      <Section title="Privasi & Data" desc="Unduh / hapus datamu sesuai UU PDP (NFR #7).">
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={btnGhost} onClick={downloadData}>Unduh Dataku</button>
          <button type="button" className={btnDanger} onClick={eraseData}>Hapus Dataku</button>
        </div>
      </Section>

      <Section title="Tentang" desc="Versi & aturan main Token.">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          RestoAI v1.5 — Workspace 7 hari, Token auto-extend +7 hari tiap aksi berbayar saat saldo &gt; 0 (PRD Section 2).
          Butuh bantuan? Hubungi kasir restoran pilot.
        </p>
      </Section>
    </div>
  );
}

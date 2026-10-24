"use client";

import { Check, Copy, Eye, Plus, Power, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  API_KEY_CHANGED,
  deleteApiKey,
  generateApiKey,
  listApiKeys,
  setKeyActive,
  type DevApiKey,
} from "@/lib/api-keys";

// ponytail: saran dari hasil tes langsung di repo ini (bukan brosur):
// llama-3.1/3.3 sudah dipensiunkan Groq (dikonfirmasi 404 dari API-nya),
// yang terbukti 200: gpt-oss-20b/120b + gemini-3.5-flash.
const FREE_MODELS = [
  {
    pakai: "Chat cepat / AI agent default",
    id: "resto-chat-fast → openai/gpt-oss-20b",
    kenapa: "Gratis di free-tier Groq, limit murah hati, terbukti 200 di repo ini. 1 Token / 1K token-LLM (PRD 6).",
  },
  {
    pakai: "Chat reasoning / analisis kompleks",
    id: "resto-chat-pro → openai/gpt-oss-120b",
    kenapa: "Gratis juga di Groq, lebih pintar tapi lebih lambat. 10 Token / 1K token-LLM (PRD 6).",
  },
  {
    pakai: "Fallback kalau Groq down",
    id: "gemini-3.5-flash (langsung, bukan via gateway)",
    kenapa: "Free-tier Google AI Studio; kadang 503 high-demand — route /api/chat otomatis fallback ke Groq.",
  },
  {
    pakai: "Gambar termurah",
    id: "nano-banana-2 / veo-3.1-lite (Vio, berbayar)",
    kenapa: "Vio TIDAK punya tier gratis — tiap request motong kredit. Paling murah: gambar 3 kredit, video veo-3.1-lite 5 kredit. Alternatif benar-benar gratis: Pollinations.ai (gambar saja, kualitas lomba kurang).",
  },
];

export default function DeveloperApi() {
  const [keys, setKeys] = useState<DevApiKey[]>([]);
  const [name, setName] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(false);
  // ponytail: origin di-set setelah mount; baca window saat render = hydration mismatch
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const reload = () => setKeys(listApiKeys());
    reload();
    setOrigin(window.location.origin);
    window.addEventListener(API_KEY_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(API_KEY_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  function onGenerate() {
    const k = generateApiKey(name || "Default Key");
    setName("");
    setJustCreated(k.full_key);
    setCopied(false);
    setReveal(false);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // abaikan
    }
  }

  const activeKey = justCreated ?? keys.find((k) => k.is_active)?.full_key ?? "rst_live_TEMPEL_KEY_DISINI";
  const curl = `curl -X POST ${origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer ${activeKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "resto-chat-fast", "messages": [{"role": "user", "content": "Halo!"}]}'`;

  return (
    <div className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Developer API</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Generate API Key (PRD 7.4) lalu pakai di AI agent via gateway OpenAI-compatible (PRD 7.3).
          </p>
        </div>

        {/* Generate */}
        <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">API Key untuk AI Agent</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama key, mis. Agen Warung — maks 100 char"
              maxLength={100}
              className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
            />
            <button
              type="button"
              onClick={onGenerate}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
            >
              <Plus size={15} /> Generate
            </button>
          </div>

          {justCreated && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Salin sekarang — key hanya ditampilkan 1x (NFR #2).
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1 font-mono text-xs dark:bg-neutral-900">
                  {reveal ? justCreated : "•".repeat(28)}
                </code>
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label="Tampilkan key"
                  className="rounded-lg border border-neutral-200 p-1.5 dark:border-neutral-700"
                >
                  <Eye size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => copy(justCreated)}
                  className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs dark:border-neutral-700"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : "Salin"}
                </button>
                <button
                  type="button"
                  onClick={() => setJustCreated(null)}
                  className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:underline"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {keys.length === 0 && (
              <p className="text-[13px] text-neutral-400">Belum ada key. Generate satu di atas.</p>
            )}
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${k.is_active ? "bg-green-500" : "bg-neutral-300"}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900 dark:text-white">{k.name}</p>
                  <p className="font-mono text-xs text-neutral-500">
                    {k.key_prefix}•••• {!k.is_active && "(dicabut)"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setKeyActive(k.id, !k.is_active)}
                  title={k.is_active ? "Cabut key" : "Aktifkan lagi"}
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Power size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteApiKey(k.id)}
                  title="Hapus permanen"
                  className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Cara pakai */}
        <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Pakai di AI Agent</h2>
          <p className="mt-1 text-[13px] text-neutral-500">
            Bentuk OpenAI-compatible — LangChain / Vercel AI SDK / curl langsung jalan. Base URL =
            asal dashboard ini + <code className="font-mono">/api/v1/chat/completions</code>. Limit 60
            req/menit/key (PRD 5.2).
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral-950 p-3 font-mono text-xs text-neutral-100">
            {curl}
          </pre>
        </section>

        {/* Model gratis */}
        <section className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Model gratis yang disarankan
          </h2>
          <ul className="mt-3 space-y-3">
            {FREE_MODELS.map((m) => (
              <li key={m.id} className="text-[13px]">
                <p className="font-medium text-neutral-900 dark:text-white">{m.pakai}</p>
                <code className="font-mono text-xs text-primary">{m.id}</code>
                <p className="mt-0.5 text-neutral-500">{m.kenapa}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ponytail: request chat jalan di module-scope agar selamat dari pindah page.
// Navigasi SPA tidak reload module — fetch ke /api/chat jalan terus walau
// ChatPanel unmount; balasan tetap disimpan via appendChatMessage (PRD 5.3),
// panel yang dibuka kembali memuatnya dari storage + subscription di bawah.
import { appendChatMessage } from "./chat-history";

export const CHAT_JOBS_CHANGED = "ftai:chat-jobs-changed";

const running = new Map<string, AbortController>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHAT_JOBS_CHANGED));
}

export function isChatRunning(sessionId: string): boolean {
  return running.has(sessionId);
}

export function subscribeChatJobs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function stopChatJob(sessionId: string) {
  running.get(sessionId)?.abort();
}

export function startChatJob(args: {
  sessionId: string;
  message: string;
  history: { role: string; content: string }[];
  model: string;
}) {
  if (running.has(args.sessionId)) return;
  const controller = new AbortController();
  running.set(args.sessionId, controller);
  emit();

  // ponytail: fire-and-forget — unmount tidak membatalkan, hanya tombol stop yang abort.
  (async () => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: args.message, history: args.history, model: args.model }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Gagal menghubungi AI");
      appendChatMessage(args.sessionId, "assistant", String(data.reply ?? ""));
    } catch (e) {
      // ponytail: abort = user sengaja pause, bukan error — tanpa bubble merah.
      if (e instanceof DOMException && e.name === "AbortError") {
        appendChatMessage(args.sessionId, "assistant", "Dihentikan.");
      } else {
        appendChatMessage(args.sessionId, "assistant", `Maaf, ${e instanceof Error ? e.message : "Gagal menghubungi AI"}`);
      }
    } finally {
      running.delete(args.sessionId);
      emit();
    }
  })();
}

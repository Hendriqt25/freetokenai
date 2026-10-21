// ponytail: sesi chat ala PRD §5.3/§7.4. Sumber kebenaran = DB (chat_sessions/
// chat_messages via /api/v1/chat/sessions). Modul ini menyimpan CACHE sinkron
// supaya pemanggil lama (Sidebar/ChatPanel) tak perlu jadi async semua:
//   - baca  : listChatSessions()/getChatMessages() -> cache (sync)
//   - isi   : hydrateSessions()/hydrateMessages()  -> GET lalu notify
//   - tulis : createChatSession()/deleteChatSession() -> endpoint
// localStorage DIPERTAHANKAN hanya sebagai fallback saat fetch gagal/5xx
// (pola TASK-002), bukan sumber utama.
import { currentUserId } from "./current-user";

export type ChatSession = {
  id: string;
  title: string; // auto dari pesan pertama, dipotong (PRD 5.3, VARCHAR 150)
  created_at: string;
  updated_at: string;
};

export type ChatAttachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: "document" | "image";
  char_count: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  finish_reason?: string | null;
  attachments?: ChatAttachment[];
};

export const CHAT_CHANGED = "ftai:chat-changed";
export const CHAT_NEW = "ftai:chat-new";
export const MESSAGE_PAGE_SIZE = 30;

export type MessagesPage = { messages: ChatMessage[]; hasMore: boolean };

const sessionsKey = () => `ftai:chat:${currentUserId()}:sessions`;
const messagesKey = (id: string) => `ftai:chat:${currentUserId()}:messages:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ponytail: storage penuh/private mode -> jalan tanpa simpan, jangan crash
  }
}

export function notifyChatChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHAT_CHANGED));
}

const sessionsCache: ChatSession[] = [];
const messagesCache = new Map<string, ChatMessage[]>();

function seedFromStorage() {
  if (!sessionsCache.length) {
    const local = read<ChatSession[]>(sessionsKey(), []);
    if (Array.isArray(local)) sessionsCache.push(...local);
  }
}

export function listChatSessions(): ChatSession[] {
  if (typeof window !== "undefined") seedFromStorage();
  return [...sessionsCache].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getChatMessages(sessionId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  if (!messagesCache.has(sessionId)) {
    const local = read<ChatMessage[]>(messagesKey(sessionId), []);
    messagesCache.set(sessionId, Array.isArray(local) ? local : []);
  }
  return messagesCache.get(sessionId) ?? [];
}

// ponytail: tarik daftar sesi dari DB. Gagal/5xx -> pakai cache/localStorage lama.
export async function hydrateSessions(): Promise<void> {
  try {
    const res = await fetch("/api/v1/chat/sessions", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (Array.isArray(data?.sessions)) {
      sessionsCache.length = 0;
      sessionsCache.push(...data.sessions);
      write(sessionsKey(), sessionsCache);
    }
  } catch {
    seedFromStorage();
  }
  notifyChatChanged();
}

export async function hydrateMessages(sessionId: string): Promise<MessagesPage> {
  try {
    const res = await fetch(
      `/api/v1/chat/sessions/${sessionId}/messages?limit=${MESSAGE_PAGE_SIZE}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (Array.isArray(data?.messages)) {
      messagesCache.set(sessionId, data.messages);
      write(messagesKey(sessionId), data.messages);
      notifyChatChanged();
      return { messages: data.messages, hasMore: Boolean(data.has_more) };
    }
  } catch {
    // biarkan cache/localStorage yang ada
  }
  notifyChatChanged();
  return { messages: getChatMessages(sessionId), hasMore: false };
}

/** Muat halaman lebih lama lalu prepend ke cache. */
export async function loadOlderMessages(
  sessionId: string,
  beforeId: string,
): Promise<{ added: number; hasMore: boolean }> {
  try {
    const res = await fetch(
      `/api/v1/chat/sessions/${sessionId}/messages?limit=${MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(beforeId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!Array.isArray(data?.messages)) return { added: 0, hasMore: false };

    const existing = getChatMessages(sessionId);
    const known = new Set(existing.map((m) => m.id));
    const older = (data.messages as ChatMessage[]).filter((m) => !known.has(m.id));
    const merged = [...older, ...existing];
    messagesCache.set(sessionId, merged);
    write(messagesKey(sessionId), merged);
    notifyChatChanged();
    return { added: older.length, hasMore: Boolean(data.has_more) };
  } catch {
    return { added: 0, hasMore: false };
  }
}

export async function createChatSession(): Promise<ChatSession> {
  try {
    const res = await fetch("/api/v1/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const session: ChatSession = data.session;
    sessionsCache.unshift(session);
    write(sessionsKey(), sessionsCache);
    notifyChatChanged();
    return session;
  } catch {
    const now = new Date().toISOString();
    const session: ChatSession = { id: crypto.randomUUID(), title: "Obrolan Baru", created_at: now, updated_at: now };
    sessionsCache.unshift(session);
    write(sessionsKey(), sessionsCache);
    notifyChatChanged();
    return session;
  }
}

// ponytail: append lokal (bubble optimistis user + balasan error/abort job).
// Giliran SUKSES disimpan oleh server di /api/chat; panel memuatnya via
// hydrateMessages — jadi fungsi ini tak menulis pesan ke DB.
export function appendChatMessage(sessionId: string, role: "user" | "assistant", content: string): ChatMessage[] {
  const messages = [
    ...getChatMessages(sessionId),
    { id: crypto.randomUUID(), role, content, created_at: new Date().toISOString() },
  ];
  messagesCache.set(sessionId, messages);
  write(messagesKey(sessionId), messages);
  const idx = sessionsCache.findIndex((s) => s.id === sessionId);
  const title = role === "user" ? content.slice(0, 60) || "Obrolan Baru" : "Obrolan Baru";
  if (idx >= 0) {
    if (role === "user" && sessionsCache[idx].title === "Obrolan Baru") sessionsCache[idx].title = title;
    sessionsCache[idx].updated_at = new Date().toISOString();
  }
  write(sessionsKey(), sessionsCache);
  notifyChatChanged();
  return messages;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  const i = sessionsCache.findIndex((s) => s.id === sessionId);
  if (i >= 0) sessionsCache.splice(i, 1);
  messagesCache.delete(sessionId);
  write(sessionsKey(), sessionsCache);
  try {
    localStorage.removeItem(messagesKey(sessionId));
  } catch {
    // abaikan
  }
  notifyChatChanged();
  try {
    await fetch(`/api/v1/chat/sessions/${sessionId}`, { method: "DELETE" });
  } catch {
    // ponytail: gagal hapus server -> sesi hilang dari cache; refresh akan munculkan lagi
  }
}

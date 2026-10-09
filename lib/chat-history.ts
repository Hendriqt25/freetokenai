// ponytail: sesi chat ala PRD 5.3 (chat_sessions + chat_messages) versi lokal per-user.
// Backend belum ada -> localStorage dulu. Saat API siap (Section 7.4), ganti ISI
// fungsi ini dengan fetch — tanpa ubah pemanggil:
//   list <-> GET /api/v1/chat/sessions
//   messages <-> GET /api/v1/chat/sessions/:id/messages
//   delete <-> DELETE /api/v1/chat/sessions/:id
import { currentUserId } from "./current-user";

export type ChatSession = {
  id: string;
  title: string; // auto dari pesan pertama, dipotong (PRD 5.3, VARCHAR 150)
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export const CHAT_CHANGED = "ftai:chat-changed";
export const CHAT_NEW = "ftai:chat-new";

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

export function listChatSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  const arr = read<ChatSession[]>(sessionsKey(), []);
  return (Array.isArray(arr) ? arr : []).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function createChatSession(): ChatSession {
  const now = new Date().toISOString();
  const session: ChatSession = { id: crypto.randomUUID(), title: "Obrolan Baru", created_at: now, updated_at: now };
  write(sessionsKey(), [session, ...read<ChatSession[]>(sessionsKey(), [])]);
  write(messagesKey(session.id), []);
  notifyChatChanged();
  return session;
}

export function getChatMessages(sessionId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  const arr = read<ChatMessage[]>(messagesKey(sessionId), []);
  return Array.isArray(arr) ? arr : [];
}

export function appendChatMessage(sessionId: string, role: "user" | "assistant", content: string): ChatMessage[] {
  const messages = [...getChatMessages(sessionId), { id: crypto.randomUUID(), role, content, created_at: new Date().toISOString() }];
  write(messagesKey(sessionId), messages);
  // ponytail: judul = pesan user pertama, dipotong 60 char (ala potongan judul di referensi 4.5).
  write(
    sessionsKey(),
    read<ChatSession[]>(sessionsKey(), []).map((s) =>
      s.id !== sessionId
        ? s
        : {
            ...s,
            title: role === "user" && s.title === "Obrolan Baru" ? content.slice(0, 60) || "Obrolan Baru" : s.title,
            updated_at: new Date().toISOString(),
          },
    ),
  );
  notifyChatChanged();
  return messages;
}

export function deleteChatSession(sessionId: string) {
  write(
    sessionsKey(),
    read<ChatSession[]>(sessionsKey(), []).filter((s) => s.id !== sessionId),
  );
  try {
    localStorage.removeItem(messagesKey(sessionId));
  } catch {
    // abaikan
  }
  notifyChatChanged();
}

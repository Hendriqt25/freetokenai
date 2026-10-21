// ponytail: sesi media ala PRD (chat_sessions + usage_logs.media_url) versi lokal per-user.
// Backend belum ada -> localStorage dulu, bentuk entri siap dipindah ke tabel.
// Dipakai MediaStudio (simpan + muat); Sidebar "Terbaru" tetap khusus chat per PRD 4.5.
import { currentUserId } from "./current-user";
export type MediaSession = {
  id: string;
  kind: "image" | "video";
  title: string; // auto dari prompt pertama, dipotong (ala PRD 5.3)
  prompt: string;
  style?: string;
  model: string;
  ratio: string;
  quality?: string;
  count?: number;
  asset_url: string;
  asset_urls?: string[];
  created_at: string;
  // Video-specific fields (from DB migration 0010)
  reference_image_url?: string | null;
  duration?: number;
  motion?: string;
  fps?: number;
};

const key = (kind: "image" | "video") => `ftai:media:${currentUserId()}:${kind}`;
const MAX = 20;

export function loadMediaHistory(kind: "image" | "video"): MediaSession[] {
  try {
    const raw = localStorage.getItem(key(kind));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function removeMediaAsset(kind: "image" | "video", sessionId: string, url: string): MediaSession[] {
  const next = loadMediaHistory(kind)
    .map((s) => {
      if (s.id !== sessionId) return s;
      const urls = (s.asset_urls ?? (s.asset_url ? [s.asset_url] : [])).filter((u) => u !== url);
      return { ...s, asset_url: urls[0] ?? "", asset_urls: urls };
    })
    .filter((s) => (s.asset_urls ?? (s.asset_url ? [s.asset_url] : [])).length > 0);
  try {
    localStorage.setItem(key(kind), JSON.stringify(next));
  } catch {
    // ponytail: gagal simpan -> abaikan, jangan crash
  }
  return next;
}
export function saveMediaSession(s: Omit<MediaSession, "id" | "title" | "created_at">): MediaSession[] {
  const entry: MediaSession = {
    ...s,
    id: crypto.randomUUID(),
    title: s.prompt.slice(0, 40) || "Tanpa judul",
    created_at: new Date().toISOString(),
  };
  const next = [entry, ...loadMediaHistory(s.kind)].slice(0, MAX);
  try {
    localStorage.setItem(key(s.kind), JSON.stringify(next));
  } catch {
    // ponytail: storage penuh/private mode -> sesi jalan tanpa simpan, jangan crash
  }
  return next;
}

// ponytail: API key ala PRD 5.3 (api_keys) + 7.4 (POST /api/v1/api-keys) versi lokal per-user.
// Backend belum ada -> localStorage dulu. Saat API siap, ganti ISI fungsi ini
// dengan fetch — pemanggil tak berubah. Key asli: SHA-256 + tampil 1x (NFR #2);
// di sini full key disimpan lokal hanya sebagai dev-mode (bukan pola produksi).
import { currentUserId } from "./current-user";

export type DevApiKey = {
  id: string;
  name: string;
  key_prefix: string; // rst_live_ + 6 char, yang tampil di list
  full_key: string; // dev-mode saja; produksi: hanya key_hash di DB
  is_active: boolean;
  created_at: string;
};

export const API_KEY_CHANGED = "ftai:apikey-changed";
const keysKey = () => `ftai:apikey:${currentUserId()}:keys`;

function read(): DevApiKey[] {
  try {
    const raw = localStorage.getItem(keysKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(keys: DevApiKey[]) {
  try {
    localStorage.setItem(keysKey(), JSON.stringify(keys));
  } catch {
    // abaikan
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(API_KEY_CHANGED));
}

// ponytail: crypto.getRandomValues, bukan Math.random — key harus unpredictable.
function randomSecret(len = 24): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

export function listApiKeys(): DevApiKey[] {
  if (typeof window === "undefined") return [];
  return read().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function generateApiKey(name: string): DevApiKey {
  const secret = randomSecret();
  const key: DevApiKey = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 100) || "Default Key",
    key_prefix: `rst_live_${secret.slice(0, 6)}`,
    full_key: `rst_live_${secret}`,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  write([key, ...read()]);
  notify();
  return key;
}

export function setKeyActive(id: string, active: boolean) {
  write(read().map((k) => (k.id === id ? { ...k, is_active: active } : k)));
  notify();
}

export function deleteApiKey(id: string) {
  write(read().filter((k) => k.id !== id));
  notify();
}

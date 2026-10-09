// ponytail: pengaturan ala PRD 4.5/5.3/7.4 versi lokal per-user.
// Backend belum ada -> localStorage dulu. Saat API siap, ganti ISI fungsi
// dengan fetch — tanpa ubah pemanggil:
//   profil <-> PATCH /api/v1/users/profile (+ kolom users.name/avatar_url)
//   perangkat <-> GET / DELETE /api/v1/sessions (maks 2 device, PRD Section 2)
//   workspace <-> GET /api/v1/workspace (read-only di client)
import { currentUserId } from "./current-user";
import { DEFAULT_CHAT_MODEL } from "./chat-models";
import { mockUser } from "./mock-data";

export const SETTINGS_CHANGED = "ftai:settings-changed";

export function notifySettingsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SETTINGS_CHANGED));
}

export type UserProfile = { name: string; contact: string; avatarUrl: string | null };

const profileKey = () => `ftai:user:${currentUserId()}:profile`;
const appKey = () => `ftai:user:${currentUserId()}:settings`;
const devicesKey = () => `ftai:user:${currentUserId()}:devices`;

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // ponytail: private mode/storage penuh -> jalan tanpa simpan
  }
}

export function getProfile(): UserProfile {
  if (typeof window === "undefined")
    return { name: mockUser.name, contact: mockUser.phoneNumber, avatarUrl: null };
  return read<UserProfile>(profileKey(), {
    name: mockUser.name,
    contact: mockUser.phoneNumber,
    avatarUrl: null,
  });
}

export function saveProfile(p: UserProfile) {
  write(profileKey(), p);
  notifySettingsChanged();
}

export type AppSettings = { defaultModel: string; language: "id" | "en" };

export function getAppSettings(): AppSettings {
  if (typeof window === "undefined") return { defaultModel: DEFAULT_CHAT_MODEL, language: "id" };
  return read<AppSettings>(appKey(), { defaultModel: DEFAULT_CHAT_MODEL, language: "id" });
}

export function saveAppSettings(s: AppSettings) {
  write(appKey(), s);
  notifySettingsChanged();
}

export type Device = { id: string; label: string; lastActive: string; current: boolean };

export function listDevices(): Device[] {
  if (typeof window === "undefined") return [];
  const cached = read<Device[]>(devicesKey(), []);
  if (cached.length) return cached;
  const now = new Date().toISOString();
  const seed: Device[] = [
    { id: "dev-current", label: "Perangkat ini", lastActive: now, current: true },
    {
      id: "dev-old",
      label: "Chrome · Windows",
      lastActive: new Date(Date.now() - 86400000).toISOString(),
      current: false,
    },
  ];
  write(devicesKey(), seed);
  return seed;
}

export function revokeDevice(id: string) {
  write(
    devicesKey(),
    listDevices().filter((d) => d.id !== id),
  );
  notifySettingsChanged();
}

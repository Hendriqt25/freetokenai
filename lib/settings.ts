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

// ponytail: default SSR-safe — nilai yang sama dirender server DAN saat hydrate,
// jangan pernah dibaca dari localStorage saat initial render (hydration mismatch).
export const DEFAULT_PROFILE: UserProfile = {
  name: mockUser.name,
  contact: mockUser.phoneNumber,
  avatarUrl: null,
};

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
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  return read<UserProfile>(profileKey(), DEFAULT_PROFILE);
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

export type WorkspaceInfo = { tokenBalance: number; expiresAt: string; expiresAtLabel: string };

// ponytail: lapisan API nyata (PRD §7.4); fallback localStorage hanya bila API 5xx/jaringan mati.
async function api<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin", ...init });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchWorkspace(): Promise<WorkspaceInfo> {
  const data = await api<{ workspace: { token_balance: number; expires_at: string } }>(
    "/api/v1/workspace",
  );
  if (!data) return { tokenBalance: 1500, expiresAt: "", expiresAtLabel: "27 September" };
  const d = new Date(data.workspace.expires_at);
  return {
    tokenBalance: data.workspace.token_balance,
    expiresAt: data.workspace.expires_at,
    expiresAtLabel: Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("id-ID", { day: "numeric", month: "long" }),
  };
}

export async function fetchProfile(): Promise<UserProfile> {
  const data = await api<{ profile: UserProfile }>("/api/v1/users/profile");
  if (!data) return getProfile();
  write(profileKey(), data.profile);
  return data.profile;
}

export async function saveProfileRemote(p: UserProfile): Promise<UserProfile> {
  const data = await api<{ profile: UserProfile }>("/api/v1/users/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: p.name, contact: p.contact }),
  });
  const next = data?.profile ?? p;
  saveProfile(next);
  return next;
}

type RemoteSession = { id: string; device_fingerprint: string; last_active: string; current: boolean };

export async function fetchDevices(): Promise<Device[]> {
  const data = await api<{ sessions: RemoteSession[] }>("/api/v1/sessions");
  if (!data) return listDevices();
  const mapped: Device[] = data.sessions.map((s) => ({
    id: s.id,
    label: s.current ? "Perangkat ini" : s.device_fingerprint,
    lastActive: s.last_active,
    current: s.current,
  }));
  write(devicesKey(), mapped);
  return mapped;
}

export async function revokeDeviceRemote(id: string): Promise<Device[]> {
  const data = await api<{ ok: boolean }>(`/api/v1/sessions?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!data) {
    revokeDevice(id);
    return listDevices();
  }
  return fetchDevices();
}

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

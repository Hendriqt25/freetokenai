// ponytail: satu helper server-only untuk Vio. Key TIDAK PERNAH ke client.
// BYOK: key diambil dari registry (DB terenkripsi) dengan fallback env VIO_API_KEY.
import { fetchRetryOnce } from "./obs";
import { providerKey } from "./model-registry";

export const VIO_BASE = "https://api.viostudio.id/v1";

export async function vioHeaders() {
  const key = await providerKey("vio");
  if (!key)
    throw new Error("API key Vio belum diisi (menu Model & API Key di /admin, atau VIO_API_KEY di .env.local)");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function vioFetch(path: string, init?: RequestInit) {
  // ponytail: NFR#6 — retry 1x hanya transient (5xx/throw); 4xx langsung pulang.
  const res = await fetchRetryOnce(`${VIO_BASE}${path}`, {
    ...init,
    headers: { ...(await vioHeaders()), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// UI ratio -> Vio aspect_ratio
export function mapAspect(kind: "image" | "video", ratio: string): string {
  if (kind === "video") return ratio === "9:16" ? "portrait" : "landscape"; // Veo: landscape|portrait, 1:1 fallback landscape
  return ratio; // image: 16:9, 1:1, 9:16 langsung valid
}

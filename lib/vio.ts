// ponytail: satu helper server-only untuk Vio. Key TIDAK PERNAH ke client.
export const VIO_BASE = "https://api.viostudio.id/v1";

export function vioHeaders() {
  const key = process.env.VIO_API_KEY;
  if (!key) throw new Error("VIO_API_KEY belum diset di .env.local");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function vioFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${VIO_BASE}${path}`, {
    ...init,
    headers: { ...vioHeaders(), ...(init?.headers ?? {}) },
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

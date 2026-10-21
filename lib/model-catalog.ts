// Picker model dinamis sisi client — tarik katalog dari /api/v1/models.
// Fallback ke daftar hardcoded lama bila API error (biar UI tidak pernah kosong).
import { CHAT_MODELS } from "./chat-models";

export type CatalogModel = {
  id: string;
  label: string;
  cost: number;
  provider?: string;
};

export const FALLBACK_IMAGE_MODELS: CatalogModel[] = [
  { id: "nano-banana-2", label: "Nano Banana 2", cost: 3 },
  { id: "nano-banana-pro", label: "Nano Banana Pro", cost: 50 },
  { id: "qwen-image", label: "Qwen Image", cost: 3 },
];

export const FALLBACK_VIDEO_MODELS: CatalogModel[] = [
  { id: "veo-3.1-lite", label: "Veo 3.1 Lite", cost: 5 },
  { id: "veo-3.1-fast", label: "Veo 3.1 Fast", cost: 40 },
  { id: "veo-3.1-quality", label: "Veo 3.1 Quality", cost: 200 },
];

export function fallbackModels(kind: "chat" | "image" | "video"): CatalogModel[] {
  if (kind === "chat") return CHAT_MODELS.map((m) => ({ ...m, cost: 1 }));
  return kind === "image" ? FALLBACK_IMAGE_MODELS : FALLBACK_VIDEO_MODELS;
}

/** Ambil model aktif per kind; selalu mengembalikan list non-kosong (fallback). */
export async function fetchCatalogModels(kind: "chat" | "image" | "video"): Promise<CatalogModel[]> {
  try {
    const res = await fetch(`/api/v1/models?kind=${kind}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as {
      models?: {
        model_id: string;
        label: string;
        cost: number;
        provider_name?: string;
      }[];
    };
    const list = (data.models ?? []).map((m) => ({
      id: m.model_id,
      label: m.label,
      cost: m.cost,
      provider: m.provider_name,
    }));
    return list.length ? list : fallbackModels(kind);
  } catch {
    return fallbackModels(kind);
  }
}

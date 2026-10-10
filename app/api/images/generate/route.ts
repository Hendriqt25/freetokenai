import { NextResponse } from "next/server";
import { mapAspect, vioFetch } from "@/lib/vio";
import {
  imageCost,
  InsufficientTokensError,
  insufficient,
  withTokens,
  workspaceIdForRequest,
} from "@/lib/billing";

const IMAGE_MODELS = ["nano-banana-2", "nano-banana-pro", "qwen-image"];

export async function POST(req: Request) {
  try {
    const { prompt, model, aspect_ratio, count } = await req.json();
    if (!prompt || String(prompt).trim().length === 0)
      return NextResponse.json({ error: { code: "INVALID_PROMPT", message: "Deskripsi tidak boleh kosong." } }, { status: 400 });
    if (model && !IMAGE_MODELS.includes(model))
      return NextResponse.json({ error: { code: "INVALID_MODEL", message: "Model tidak dikenal." } }, { status: 400 });
    const finalModel = model ?? "nano-banana-2";

    // ponytail: jumlah dibatasi 2 (hemat kredit lomba), docs izinkan s/d 4.
    const finalCount = Math.min(2, Math.max(1, Number(count) || 1));
    const payload = {
      prompt: String(prompt).slice(0, 5000),
      model: finalModel,
      aspect_ratio: mapAspect("image", aspect_ratio ?? "1:1"),
      count: finalCount,
    };
    const run = async () => {
      const { status, data } = await vioFetch("/images/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(data, { status });
    };
    // ponytail: billing Token atomik (PRD §4.3/§6) — 5xx vendor = refund otomatis.
    const wsId = await workspaceIdForRequest(req);
    if (!wsId) return run();
    try {
      return await withTokens(wsId, imageCost(finalModel), run, {
        modelId: finalModel,
        endpointType: "image",
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) return insufficient(e.balance);
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const code = msg.includes("VIO_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: code });
  }
}

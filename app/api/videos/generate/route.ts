import { NextResponse } from "next/server";
import { mapAspect, vioFetch } from "@/lib/vio";
import {
  InsufficientTokensError,
  insufficient,
  videoCost,
  withTokens,
  workspaceIdForRequest,
} from "@/lib/billing";

// ponytail: hanya Veo t2v agar tanpa field conditional (quality/duration). Murah->mahal: lite, fast, quality.
const VIDEO_MODELS = ["veo-3.1-lite", "veo-3.1-fast", "veo-3.1-quality"];

export async function POST(req: Request) {
  try {
    const { prompt, model, aspect_ratio } = await req.json();
    if (!prompt || String(prompt).trim().length === 0)
      return NextResponse.json({ error: { code: "INVALID_PROMPT", message: "Deskripsi tidak boleh kosong." } }, { status: 400 });
    if (model && !VIDEO_MODELS.includes(model))
      return NextResponse.json({ error: { code: "INVALID_MODEL", message: "Model tidak dikenal." } }, { status: 400 });

    const finalModel = model ?? "veo-3.1-lite";
    const payload = {
      prompt: String(prompt),
      mode: "t2v",
      model: finalModel,
      aspect_ratio: mapAspect("video", aspect_ratio ?? "16:9"),
      count: 1,
    };
    const run = async () => {
      const { status, data } = await vioFetch("/videos/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return NextResponse.json(data, { status });
    };
    // ponytail: billing Token atomik (PRD §4.3/§6) — vendor gagal (!ok, non-402) = refund otomatis.
    const wsId = await workspaceIdForRequest(req);
    if (!wsId) return run();
    try {
      return await withTokens(wsId, videoCost(finalModel), run, {
        modelId: finalModel,
        endpointType: "video",
      });
    } catch (e) {
      if (e instanceof InsufficientTokensError) return insufficient(e.balance);
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: 502 });
  }
}

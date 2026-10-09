import { NextResponse } from "next/server";
import { mapAspect, vioFetch } from "@/lib/vio";

// ponytail: hanya Veo t2v agar tanpa field conditional (quality/duration). Murah->mahal: lite, fast, quality.
const VIDEO_MODELS = ["veo-3.1-lite", "veo-3.1-fast", "veo-3.1-quality"];

export async function POST(req: Request) {
  try {
    const { prompt, model, aspect_ratio } = await req.json();
    if (!prompt || String(prompt).trim().length === 0)
      return NextResponse.json({ error: { code: "INVALID_PROMPT", message: "Deskripsi tidak boleh kosong." } }, { status: 400 });
    if (model && !VIDEO_MODELS.includes(model))
      return NextResponse.json({ error: { code: "INVALID_MODEL", message: "Model tidak dikenal." } }, { status: 400 });

    const { status, data } = await vioFetch("/videos/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: String(prompt),
        mode: "t2v",
        model: model ?? "veo-3.1-lite",
        aspect_ratio: mapAspect("video", aspect_ratio ?? "16:9"),
        count: 1,
      }),
    });
    return NextResponse.json(data, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: 502 });
  }
}

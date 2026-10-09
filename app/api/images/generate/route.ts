import { NextResponse } from "next/server";
import { mapAspect, vioFetch } from "@/lib/vio";

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
    const { ok, status, data } = await vioFetch("/images/generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: String(prompt).slice(0, 5000),
        model: finalModel,
        aspect_ratio: mapAspect("image", aspect_ratio ?? "1:1"),
        count: finalCount,
      }),
    });
    return NextResponse.json(data, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const code = msg.includes("VIO_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: code });
  }
}

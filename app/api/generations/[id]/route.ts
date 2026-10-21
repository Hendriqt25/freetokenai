import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { pollMediaGeneration } from "@/lib/ai-media";
import { vioFetch } from "@/lib/vio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cek status job media: job Gemini async (UUID) atau Vio (id numerik, lama).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (UUID.test(id)) {
    const auth = await requireAuth(req);
    if (!auth)
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Belum login." } }, { status: 401 });
    const result = await pollMediaGeneration(id, auth.user.id);
    if (!result)
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Job tidak ditemukan." } }, { status: 404 });
    return NextResponse.json(result);
  }
  const { status, data } = await vioFetch(`/generations/${id}`);
  return NextResponse.json(data, { status });
}

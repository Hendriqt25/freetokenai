import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Belum login." } }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const rows = (await sql`
    SELECT id, user_id, provider, model_id, operation, status, asset_url, error_message,
           created_at, updated_at
    FROM media_generations
    WHERE user_id = ${auth.user.id}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as unknown as {
    id: string;
    user_id: string | null;
    provider: string;
    model_id: string;
    operation: string | null;
    status: string;
    asset_url: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }[];

  const generations = rows.map((r) => ({
    id: r.id,
    prompt: "", // TODO: store prompt in media_generations
    model_id: r.model_id,
    aspect_ratio: "16:9",
    video_url: r.asset_url,
    status: r.status as "processing" | "completed" | "failed",
    tokens_used: 0,
    created_at: r.created_at,
    error_message: r.error_message,
    reference_image_url: null,
  }));

  return NextResponse.json({ generations });
}
import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";

// ponytail: PRD §7.4 + §4.5 — riwayat chat per Workspace (bukan per-device).
// wsId via helper yang sama dengan /api/chat (cookie sesi; seed dev non-prod).
async function wsId(req: Request): Promise<string | NextResponse> {
  const id = await workspaceIdForRequest(req);
  if (!id)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  return id;
}

export async function GET(req: Request) {
  const ws = await wsId(req);
  if (ws instanceof NextResponse) return ws;
  const rows = (await sql`
    SELECT id, title, created_at, updated_at FROM chat_sessions
    WHERE workspace_id = ${ws}
    ORDER BY updated_at DESC LIMIT 100`) as unknown as unknown[];
  return NextResponse.json({ sessions: rows });
}

export async function POST(req: Request) {
  const ws = await wsId(req);
  if (ws instanceof NextResponse) return ws;
  let body: { title?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, 150) || "Obrolan Baru";
  const rows = (await sql`
    INSERT INTO chat_sessions (workspace_id, title)
    VALUES (${ws}, ${title})
    RETURNING id, title, created_at, updated_at`) as unknown as unknown[];
  return NextResponse.json({ session: rows[0] }, { status: 201 });
}

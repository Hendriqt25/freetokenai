import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";

// ponytail: PRD §7.4 — pesan sesi (asc) untuk membuka riwayat di ChatPanel.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await workspaceIdForRequest(req);
  if (!ws)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const { id } = await params;
  const owns = (await sql`
    SELECT 1 FROM chat_sessions WHERE id = ${id} AND workspace_id = ${ws} LIMIT 1`) as unknown as unknown[];
  if (!owns[0])
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." } },
      { status: 404 },
    );
  const rows = (await sql`
    SELECT id, role, content, created_at FROM chat_messages
    WHERE session_id = ${id} ORDER BY created_at ASC`) as unknown as unknown[];
  return NextResponse.json({ messages: rows });
}

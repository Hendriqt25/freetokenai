import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";

// ponytail: PRD §7.4 — hapus sesi (chat_messages ikut via ON DELETE CASCADE).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = await workspaceIdForRequest(req);
  if (!ws)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const { id } = await params;
  const rows = (await sql`
    DELETE FROM chat_sessions WHERE id = ${id} AND workspace_id = ${ws}
    RETURNING id`) as unknown as { id: string }[];
  if (!rows[0])
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Sesi tidak ditemukan." } },
      { status: 404 },
    );
  return NextResponse.json({ deleted: rows[0].id });
}

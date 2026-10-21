import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// Hapus lampiran yang BELUM terkirim. Lampiran yang sudah menempel ke pesan
// dibiarkan sebagai bagian riwayat.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wsId = await workspaceIdForRequest(req);
  if (!wsId)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );

  const { id } = await params;
  const rows = (await sql`
    DELETE FROM chat_attachments
    WHERE id = ${id} AND workspace_id = ${wsId} AND message_id IS NULL
    RETURNING id`) as unknown as { id: string }[];
  if (!rows[0])
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Lampiran tidak ditemukan atau sudah terkirim." } },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}

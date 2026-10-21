import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  finish_reason: string | null;
  attachments: unknown;
};

// ponytail: PRD §7.4 — pesan sesi (asc) untuk membuka riwayat di ChatPanel.
// Pagination cursor `before=<message_id>` supaya chat panjang tidak memuat
// seluruh riwayat sekaligus.
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

  const url = new URL(req.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1), 100);
  const before = url.searchParams.get("before")?.slice(0, 64) ?? "";

  const rows = (await sql`
    WITH page AS (
      SELECT id, role, content, created_at, finish_reason
      FROM chat_messages
      WHERE session_id = ${id}
        ${before
          ? sql`AND (created_at, id) < (
              SELECT created_at, id FROM chat_messages
              WHERE id = ${before} AND session_id = ${id} LIMIT 1
            )`
          : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    )
    SELECT p.id, p.role, p.content, p.created_at, p.finish_reason,
      COALESCE(
        json_agg(json_build_object(
          'id', a.id,
          'filename', a.filename,
          'mime_type', a.mime_type,
          'size_bytes', a.size_bytes,
          'kind', a.kind,
          'char_count', a.char_count
        )) FILTER (WHERE a.id IS NOT NULL),
        '[]'
      ) AS attachments
    FROM page p
    LEFT JOIN chat_attachments a ON a.message_id = p.id
    GROUP BY p.id, p.role, p.content, p.created_at, p.finish_reason
    ORDER BY p.created_at ASC, p.id ASC`) as unknown as MessageRow[];

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(1) : rows;
  return NextResponse.json({
    messages,
    has_more: hasMore,
    next_before: messages[0]?.id ?? null,
  });
}

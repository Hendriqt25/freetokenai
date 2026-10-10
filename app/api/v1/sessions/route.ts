import { NextResponse } from "next/server";
import { clearedSessionCookie, createSession, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const rows = (await sql`
    SELECT id, device_fingerprint, last_active, created_at FROM sessions
    WHERE user_id = ${auth.user.id} ORDER BY last_active DESC`) as unknown as {
    id: string;
    device_fingerprint: string;
    last_active: string;
    created_at: string;
  }[];
  return NextResponse.json({
    sessions: rows.map((s) => ({ ...s, current: s.id === auth.sessionId })),
  });
}

// ponytail: login device baru = tambah sesi; ke-3 ditolak 403 (PRD §2).
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  let fingerprint = req.headers.get("user-agent") ?? "unknown";
  try {
    const body = (await req.json()) as { fingerprint?: unknown };
    if (typeof body.fingerprint === "string" && body.fingerprint.trim())
      fingerprint = body.fingerprint;
  } catch {
    // tanpa body = pakai user-agent
  }
  const created = await createSession(auth.user.id, fingerprint.slice(0, 255));
  if ("error" in created)
    return NextResponse.json(
      { error: { code: "DEVICE_LIMIT", message: "Maks 2 device aktif. Cabut salah satu dulu." } },
      { status: 403 },
    );
  return NextResponse.json({ session: { id: created.id } }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id)
    return NextResponse.json(
      { error: { code: "INVALID_ID", message: "Param id wajib." } },
      { status: 400 },
    );
  const rows = (await sql`
    DELETE FROM sessions WHERE id = ${id} AND user_id = ${auth.user.id} RETURNING id`) as unknown as {
    id: string;
  }[];
  if (!rows[0])
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Device tidak ditemukan." } },
      { status: 404 },
    );
  const res = NextResponse.json({ ok: true });
  if (id === auth.sessionId) res.headers.set("Set-Cookie", clearedSessionCookie());
  return res;
}

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logReq, newRequestId } from "@/lib/obs";

// ponytail: PRD §7.4 — rating 1-5 + feedback per usage_log. Idempoten per
// usage_log: satu baris per usage_log_id, POST ulang = UPDATE (upsert manual,
// karena schema 0001 tak punya UNIQUE constraint untuk ON CONFLICT).
// Hanya tabel ratings yang disentuh — ledger tak dimutasi.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const reqId = newRequestId();
  const t0 = Date.now();
  const { id } = await params;
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  if (!/^[0-9a-f-]{8,36}$/iu.test(id))
    return NextResponse.json(
      { error: { code: "INVALID_ID", message: "ID usage log tidak valid." } },
      { status: 400 },
    );
  let body: { rating?: unknown; feedback?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Body bukan JSON." } },
      { status: 400 },
    );
  }
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json(
      { error: { code: "INVALID_RATING", message: "Rating harus 1-5." } },
      { status: 400 },
    );
  const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2000) : null;

  // ponytail: ownership = usage_log.workspace milik user (bukan sekadar login).
  // Satu transaksi + FOR UPDATE di baris usage_log: dua POST konkuren untuk log
  // yang sama terserialisasi, jadi upsert manual tetap 1 baris (idempoten).
  const row = await sql.begin(async (tx: any) => {
    const owned = (await tx`
      SELECT ul.id FROM usage_logs ul JOIN workspaces w ON w.id = ul.workspace_id
      WHERE ul.id = ${id} AND w.user_id = ${auth.user.id} LIMIT 1 FOR UPDATE`) as unknown as {
      id: string;
    }[];
    if (!owned[0]) return null;
    const existing = (await tx`
      SELECT id FROM ratings WHERE usage_log_id = ${id} LIMIT 1`) as unknown as { id: string }[];
    if (existing[0]) {
      const upd = (await tx`
        UPDATE ratings SET rating = ${rating}, feedback_text = ${feedback}
        WHERE usage_log_id = ${id} RETURNING id`) as unknown as { id: string }[];
      return { id: upd[0].id, created: false };
    }
    const ins = (await tx`
      INSERT INTO ratings (usage_log_id, user_id, rating, feedback_text)
      VALUES (${id}, ${auth.user.id}, ${rating}, ${feedback})
      RETURNING id`) as unknown as { id: string }[];
    return { id: ins[0].id, created: true };
  });
  if (!row)
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Usage log tidak ditemukan." } },
      { status: 404 },
    );
  const res = NextResponse.json(
    { rating: { id: row.id, usage_log_id: id, rating, feedback } },
    { status: row.created ? 201 : 200 },
  );
  logReq({ reqId, endpoint: "POST /api/v1/usage-logs/:id/rating", latencyMs: Date.now() - t0, status: res.status, ok: true });
  return res;
}

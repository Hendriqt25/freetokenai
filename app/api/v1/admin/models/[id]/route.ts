import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { invalidateRegistry, parseCapabilities, type ModelKind } from "@/lib/model-registry";

function forbidden(auth: unknown) {
  if (typeof auth !== "string") return null;
  const status = auth === "unauthorized" ? 401 : 403;
  return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya super_admin." } }, { status });
}

// Edit ceklis kegunaan / label / status / default.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  const err = forbidden(auth);
  if (err) return err;
  const { id } = await params;

  let body: { label?: unknown; kinds?: unknown; is_active?: unknown; is_default?: unknown; sort_order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY", message: "Body bukan JSON." } }, { status: 400 });
  }

  try {
    const cur = (await sql`
      SELECT m.kind, m.model_id, m.provider_id
      FROM ai_models m WHERE m.id = ${id} LIMIT 1`) as unknown as {
      kind: ModelKind; model_id: string; provider_id: string | null;
    }[];
    if (!cur[0])
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Model tidak ditemukan." } }, { status: 404 });

    if (typeof body.label === "string") {
      const label = body.label.trim().slice(0, 150);
      if (!label)
        return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Label tidak boleh kosong." } }, { status: 400 });
      await sql`UPDATE ai_models SET label = ${label} WHERE id = ${id}`;
    }
    if (body.kinds !== undefined) {
      const kinds = parseCapabilities(body.kinds);
      if (!kinds.length)
        return NextResponse.json({ error: { code: "INVALID_KIND", message: "Pilih minimal satu kegunaan." } }, { status: 400 });
      await sql`UPDATE ai_models SET kinds = ${kinds}::varchar[] WHERE id = ${id}`;
    }
    if (typeof body.is_active === "boolean")
      await sql`UPDATE ai_models SET is_active = ${body.is_active} WHERE id = ${id}`;
    if (typeof body.sort_order === "number")
      await sql`UPDATE ai_models SET sort_order = ${Math.floor(body.sort_order)} WHERE id = ${id}`;
    if (body.is_default === true) {
      await sql`UPDATE ai_models SET is_default = FALSE WHERE kind = ${cur[0].kind}`;
      await sql`UPDATE ai_models SET is_default = TRUE, is_active = TRUE WHERE id = ${id}`;
    } else if (body.is_default === false) {
      await sql`UPDATE ai_models SET is_default = FALSE WHERE id = ${id}`;
    }
  } catch {
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Gagal mengubah model." } }, { status: 500 });
  }
  invalidateRegistry();
  return NextResponse.json({ ok: true });
}

// Hapus model dari katalog.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  const err = forbidden(auth);
  if (err) return err;
  const { id } = await params;
  try {
    await sql`DELETE FROM ai_models WHERE id = ${id}`;
  } catch {
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Gagal menghapus model." } }, { status: 500 });
  }
  invalidateRegistry();
  return NextResponse.json({ ok: true });
}

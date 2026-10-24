import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/permissions";

export async function OPTIONS(req: Request) {
  const origin = requireAllowedOrigin(req);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } }, { status: 403, headers: corsHeaders(null) });

  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  if (typeof auth === "string") {
    const status = auth === "unauthorized" ? 401 : 403;
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya super_admin." } }, { status, headers: corsHeaders(origin) });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY", message: "Body bukan JSON." } }, { status: 400, headers: corsHeaders(origin) });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  const rupiah = body.rupiah_amount !== undefined ? Number(body.rupiah_amount) : undefined;
  const tokens = body.tokens_granted !== undefined ? Number(body.tokens_granted) : undefined;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : undefined;
  const defaultExpires = typeof body.default_expires_days === 'number' ? body.default_expires_days : undefined;
  const maxExpires = typeof body.max_expires_days === 'number' ? body.max_expires_days : undefined;

  if (rupiah !== undefined && (rupiah <= 0 || !Number.isFinite(rupiah)))
    return NextResponse.json({ error: { code: "INVALID_AMOUNT", message: "Rupiah harus > 0." } }, { status: 400, headers: corsHeaders(origin) });
  if (tokens !== undefined && (tokens <= 0 || !Number.isFinite(tokens)))
    return NextResponse.json({ error: { code: "INVALID_AMOUNT", message: "Token harus > 0." } }, { status: 400, headers: corsHeaders(origin) });
  if (defaultExpires !== undefined && maxExpires !== undefined && defaultExpires > maxExpires)
    return NextResponse.json({ error: { code: "INVALID_EXPIRY", message: "default_expires_days <= max_expires_days." } }, { status: 400, headers: corsHeaders(origin) });

  try {
    const updated = (await sql`
      UPDATE token_packages SET
        name = COALESCE(${name ?? null}, name),
        rupiah_amount = COALESCE(${rupiah ?? null}, rupiah_amount),
        tokens_granted = COALESCE(${tokens ?? null}, tokens_granted),
        is_active = COALESCE(${isActive ?? null}, is_active),
        sort_order = COALESCE(${sortOrder ?? null}, sort_order),
        default_expires_days = COALESCE(${defaultExpires ?? null}, default_expires_days),
        max_expires_days = COALESCE(${maxExpires ?? null}, max_expires_days)
      WHERE id = ${id}
      RETURNING id, cafe_id, name, rupiah_amount, tokens_granted, is_active, sort_order, default_expires_days, max_expires_days`) as unknown as Array<any>;

    if (!updated[0]) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Paket tidak ditemukan." } }, { status: 404, headers: corsHeaders(origin) });
    }
    await logAudit(auth.user.id, 'package.update', 'token_packages', id, body as Record<string, unknown>);
    return NextResponse.json({ package: updated[0] }, { headers: corsHeaders(origin) });
  } catch (e) {
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: e instanceof Error ? e.message : "Gagal memperbarui." } }, { status: 500, headers: corsHeaders(origin) });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json({ error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } }, { status: 403, headers: corsHeaders(null) });

  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  if (typeof auth === "string") {
    const status = auth === "unauthorized" ? 401 : 403;
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya super_admin." } }, { status, headers: corsHeaders(origin) });
  }

  try {
    await sql`UPDATE token_packages SET is_active = FALSE WHERE id = ${id}`;
    await logAudit(auth.user.id, 'package.delete', 'token_packages', id, {});
    return NextResponse.json({ success: true }, { headers: corsHeaders(origin) });
  } catch (e) {
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: e instanceof Error ? e.message : "Gagal menghapus." } }, { status: 500, headers: corsHeaders(origin) });
  }
}
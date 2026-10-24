import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/permissions";

// ponytail: GET /api/v1/admin/token-packages — daftar paket aktif untuk Web
// Kasir (/kasir). Kasir hanya lihat paket global + milik cafenya; super_admin
// lihat semua (opsional ?cafe_id= untuk filter). Satu query, tanpa JOIN.
export async function OPTIONS(req: Request) {
  const origin = requireAllowedOrigin(req);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );
  const auth = await requireAdmin(req, { roles: ["kasir", "super_admin"] });
  if (typeof auth === "string")
    return NextResponse.json(
      { error: { code: auth.toUpperCase(), message: "Akses kasir tidak sah." } },
      { status: auth === "unauthorized" ? 401 : 403, headers: corsHeaders(origin) },
    );

  let rows;
  if (auth.user.role === "kasir") {
    if (!auth.user.cafe_id)
      return NextResponse.json(
        { error: { code: "FORBIDDEN_CAFE", message: "Akun kasir belum terikat cafe." } },
        { status: 403, headers: corsHeaders(origin) },
      );
    rows = (await sql`
      SELECT id, cafe_id, name, rupiah_amount, tokens_granted, sort_order, is_active, default_expires_days, max_expires_days
      FROM token_packages
      WHERE is_active = TRUE AND (cafe_id IS NULL OR cafe_id = ${auth.user.cafe_id})
      ORDER BY sort_order, rupiah_amount`) as unknown as Array<{
      id: string;
      cafe_id: string | null;
      name: string;
      rupiah_amount: number;
      tokens_granted: number;
      sort_order: number;
    }>;
  } else {
    const cafeFilter = new URL(req.url).searchParams.get("cafe_id")?.trim() || null;
    if (cafeFilter && !/^[0-9a-f-]{8,36}$/iu.test(cafeFilter))
      return NextResponse.json(
        { error: { code: "INVALID_CAFE_ID", message: "cafe_id bukan UUID." } },
        { status: 400, headers: corsHeaders(origin) },
      );
    rows = (await sql`
      SELECT id, cafe_id, name, rupiah_amount, tokens_granted, sort_order, is_active, default_expires_days, max_expires_days
      FROM token_packages
      WHERE is_active = TRUE AND (${cafeFilter}::uuid IS NULL OR cafe_id IS NULL OR cafe_id = ${cafeFilter}::uuid)
      ORDER BY sort_order, rupiah_amount`) as unknown as Array<{
      id: string;
      cafe_id: string | null;
      name: string;
      rupiah_amount: number;
      tokens_granted: number;
      sort_order: number;
    }>;
  }
  return NextResponse.json({ packages: rows }, { headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { roles: ['super_admin'] });
  if (typeof auth === 'string') {
    const status = auth === 'unauthorized' ? 401 : 403;
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Hanya super_admin.' } }, { status });
  }

  let body: {
    name?: unknown;
    rupiah_amount?: unknown;
    tokens_granted?: unknown;
    cafe_id?: unknown;
    is_active?: unknown;
    sort_order?: unknown;
    default_expires_days?: unknown;
    max_expires_days?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_BODY', message: 'Body bukan JSON.' } }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: { code: 'INVALID_NAME', message: 'Nama paket wajib.' } }, { status: 400 });
  }
  const rupiah = Number(body.rupiah_amount);
  const tokens = Number(body.tokens_granted);
  if (!Number.isFinite(rupiah) || rupiah <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
    return NextResponse.json({ error: { code: 'INVALID_AMOUNT', message: 'Rupiah & token harus > 0.' } }, { status: 400 });
  }
  const cafeId = body.cafe_id === null || body.cafe_id === undefined || body.cafe_id === ''
    ? null
    : (typeof body.cafe_id === 'string' ? body.cafe_id.trim() : null);
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
  const defaultExpires = typeof body.default_expires_days === 'number' && body.default_expires_days > 0 ? body.default_expires_days : 30;
  const maxExpires = typeof body.max_expires_days === 'number' && body.max_expires_days > 0 ? body.max_expires_days : 90;
  if (defaultExpires > maxExpires) {
    return NextResponse.json({ error: { code: 'INVALID_EXPIRY', message: 'default_expires_days <= max_expires_days.' } }, { status: 400 });
  }

  try {
    const rows = (await sql`
      INSERT INTO token_packages (cafe_id, name, rupiah_amount, tokens_granted, is_active, sort_order, default_expires_days, max_expires_days)
      VALUES (${cafeId}, ${name}, ${rupiah}, ${tokens}, ${isActive}, ${sortOrder}, ${defaultExpires}, ${maxExpires})
      RETURNING id, cafe_id, name, rupiah_amount, tokens_granted, is_active, sort_order, default_expires_days, max_expires_days`) as unknown as Array<any>;
    await logAudit(auth.user.id, 'package.create', 'token_packages', rows[0].id, { name, tokens });
    return NextResponse.json({ package: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: e instanceof Error ? e.message : 'Gagal membuat paket' } }, { status: 500 });
  }
}

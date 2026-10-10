import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";

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
      SELECT id, cafe_id, name, rupiah_amount, tokens_granted, sort_order
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
      SELECT id, cafe_id, name, rupiah_amount, tokens_granted, sort_order
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

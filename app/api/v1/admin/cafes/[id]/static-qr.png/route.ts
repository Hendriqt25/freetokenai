import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { publicBaseUrl } from "@/lib/app-url";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/auth";
import { sql } from "@/lib/db";

// ponytail: GET /api/v1/admin/cafes/:id/static-qr.png — QR statis per cafe
// (PRD v1.6 §7.4) untuk print/display di kasir. Isi = claim URL + cafe_id,
// sama untuk semua transaksi cafe ini (beda dengan QR struk per transaksi).
// Kasir hanya cafe sendiri (via requireAdmin cafeId), super_admin semua.
export async function OPTIONS(req: Request) {
  const origin = requireAllowedOrigin(req);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );
  const { id: cafeId } = await params;
  const auth = await requireAdmin(req, { roles: ["kasir", "super_admin"], cafeId });
  if (typeof auth === "string")
    return NextResponse.json(
      { error: { code: auth.toUpperCase(), message: "Akses admin tidak sah." } },
      { status: auth === "unauthorized" ? 401 : 403, headers: corsHeaders(origin) },
    );
  const cafes = (await sql`SELECT id FROM cafes WHERE id = ${cafeId} LIMIT 1`) as unknown as {
    id: string;
  }[];
  if (!cafes[0])
    return NextResponse.json(
      { error: { code: "CAFE_NOT_FOUND", message: "Cafe tidak ditemukan." } },
      { status: 404, headers: corsHeaders(origin) },
    );
  // Base URL: APP_BASE_URL / proxy header / origin request (lib/app-url.ts).
  const base = publicBaseUrl(req);
  const png = await QRCode.toBuffer(`${base}/claim?cafe_id=${encodeURIComponent(cafeId)}`, {
    errorCorrectionLevel: "H",
    width: 300,
    margin: 2,
    type: "png",
  });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

import { NextResponse } from "next/server";
import { corsHeaders, createAccessToken, requireAllowedOrigin, rotateRefreshToken } from "@/lib/auth";

// ponytail: refresh rotation — refresh token dipakai sekali (row dihapus saat
// dipakai, pola sessions), lalu terbitkan pasangan access(baru, pendek) + refresh(baru).
export async function POST(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );
  let body: { refresh_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Body bukan JSON." } },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
  const raw = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (!raw)
    return NextResponse.json(
      { error: { code: "INVALID_REFRESH_TOKEN", message: "refresh_token wajib." } },
      { status: 400, headers: corsHeaders(origin) },
    );
  const rotated = await rotateRefreshToken(raw, origin);
  if (!rotated)
    return NextResponse.json(
      { error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token tidak valid / sudah kedaluwarsa." } },
      { status: 401, headers: corsHeaders(origin) },
    );
  return NextResponse.json(
    {
      access_token: createAccessToken(rotated.user),
      refresh_token: rotated.refreshToken,
      user: { id: rotated.user.id, role: rotated.user.role, cafe_id: rotated.user.cafe_id },
    },
    { status: 201, headers: corsHeaders(origin) },
  );
}
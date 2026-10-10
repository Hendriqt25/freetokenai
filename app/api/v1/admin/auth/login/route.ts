import { NextResponse } from "next/server";
import { corsHeaders, loginByPassword, requireAllowedOrigin } from "@/lib/admin-auth";

// ponytail: login admin bearer lintas origin (PRD §7.1). Tidak memakai cookie web
// SameSite=Lax — kasir/ui standalone admin.restoran.com beda origin. Origin salah
// -> 403 tanpa verifikasi kredensial (pakai null-blank agar timing tetap ada).
export async function POST(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Body bukan JSON." } },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password)
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Email dan password wajib." } },
      { status: 400, headers: corsHeaders(origin) },
    );
  const login = await loginByPassword(email, password, origin);
  if (!login)
    return NextResponse.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Email/password salah atau bukan akun kasir/super admin." } },
      { status: 401, headers: corsHeaders(origin) },
    );
  return NextResponse.json(
    {
      access_token: login.accessToken,
      refresh_token: login.refreshToken,
      user: { id: login.user.id, role: login.user.role, cafe_id: login.user.cafe_id },
    },
    { status: 201, headers: corsHeaders(origin) },
  );
}
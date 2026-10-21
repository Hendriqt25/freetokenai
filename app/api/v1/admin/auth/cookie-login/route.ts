import { NextResponse } from "next/server";
import { adminSessionCookieHeader, corsHeaders, createSession, loginByPassword, requireAllowedOrigin } from "@/lib/auth";
import { rateLimited, retryAfterSec } from "@/lib/rate-limit";

// ponytail: login web /admin — verifikasi password admin (loginByPassword),
// khusus super_admin, lalu set cookie ftai_admin_session (TERPISAH dari
// ftai_session milik customer). Layout (console) membaca getAdminServerSession.
// Bearer JWT untuk API lintas origin tetap lewat /auth/login (admin_sessions).
export async function POST(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (await rateLimited(`admin:cookie-login:ip:${ip}`, 10, 60))
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak percobaan login." } },
      { status: 429, headers: { "Retry-After": String(retryAfterSec(60)) } },
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
  if (login.user.role !== "super_admin")
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Konsol web khusus super_admin." } },
      { status: 403, headers: corsHeaders(origin) },
    );

  const fingerprint = (req.headers.get("user-agent") ?? "admin-web").slice(0, 255);
  const session = await createSession(login.user.id, fingerprint);
  const res = NextResponse.json(
    { user: { id: login.user.id, role: login.user.role } },
    { status: 200, headers: corsHeaders(origin) },
  );
  res.headers.set("Set-Cookie", adminSessionCookieHeader(session.id));
  return res;
}
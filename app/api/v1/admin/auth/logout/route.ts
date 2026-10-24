import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import {
  ADMIN_SESSION_COOKIE,
  clearedAdminSessionCookie,
  corsHeaders,
  requireAllowedOrigin,
} from "@/lib/auth";

// Logout console web (cookie) sekaligus Bearer (refresh_token opsional).
export async function POST(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );

  const body = await req.json().catch(() => ({}) as { refresh_token?: unknown });
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (refreshToken) {
    const hash = createHash("sha256").update(refreshToken).digest("hex");
    await sql`DELETE FROM admin_sessions WHERE refresh_token_hash = ${hash}`;
  }

  const match = new RegExp(`(?:^|;\\s*)${ADMIN_SESSION_COOKIE}=([0-9a-f-]{8,36})`, "iu").exec(
    req.headers.get("cookie") ?? "",
  );
  if (match?.[1]) await sql`DELETE FROM sessions WHERE id = ${match[1]}`;

  const res = NextResponse.json({ ok: true }, { headers: corsHeaders(origin) });
  res.headers.set("Set-Cookie", clearedAdminSessionCookie());
  return res;
}

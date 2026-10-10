import { NextResponse } from "next/server";
import { clearedSessionCookie, createSession, devSeedUserId, requireAuth, sessionCookieHeader } from "@/lib/auth";

// ponytail: dev auto-login via seed user TASK-001; klaim QR (/claim) ditunda.
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth) return NextResponse.json({ user: auth.user });

  // ponytail: dev auto-login hanya non-production; di production anon = 401.
  if (process.env.NODE_ENV === "production")
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const userId = await devSeedUserId();
  if (!userId)
    return NextResponse.json(
      { error: { code: "NO_SEED_USER", message: "Seed user belum ada — jalankan npm run db:seed." } },
      { status: 500 },
    );
  const ua = (req.headers.get("user-agent") ?? "dev-auto").slice(0, 255);
  const created = await createSession(userId, ua);
  const authed = await requireAuth(
    new Request(req.url, { headers: { cookie: `ftai_session=${created.id}` } }),
  );
  const res = NextResponse.json({ user: authed!.user });
  res.headers.set("Set-Cookie", sessionCookieHeader(created.id));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearedSessionCookie());
  return res;
}

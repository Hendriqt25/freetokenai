import { NextResponse } from "next/server";
import { clearedSessionCookie, createSession, devSeedUserId, requireAuth, sessionCookieHeader } from "@/lib/auth";

// ponytail: dev auto-login via seed user TASK-001; klaim QR (/claim) ditunda.
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth) return NextResponse.json({ user: auth.user });

  const userId = await devSeedUserId();
  if (!userId)
    return NextResponse.json(
      { error: { code: "NO_SEED_USER", message: "Seed user belum ada — jalankan npm run db:seed." } },
      { status: 500 },
    );
  const ua = (req.headers.get("user-agent") ?? "dev-auto").slice(0, 255);
  const created = await createSession(userId, ua);
  if ("error" in created)
    return NextResponse.json(
      { error: { code: "DEVICE_LIMIT", message: "Maks 2 device aktif. Cabut salah satu dulu." } },
      { status: 403 },
    );
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

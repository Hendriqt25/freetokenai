import { NextResponse } from "next/server";
import { createSession, devSeedUserId, sessionCookieHeader } from "@/lib/auth";
import { sql } from "@/lib/db";

// KHUSUS NON-PRODUCTION: ganti sesi customer aktif ke seed dev@example.com.
// Dipakai tombol "Masuk sebagai Dev" di Pengaturan untuk menguji dashboard
// customer + workspace 1.500 Token tanpa mengganggu cookie admin console.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Tidak tersedia." } },
      { status: 404 },
    );

  const userId = await devSeedUserId();
  if (!userId)
    return NextResponse.json(
      { error: { code: "NO_SEED_USER", message: "Seed user belum ada — jalankan npm run db:seed." } },
      { status: 500 },
    );

  const fingerprint = (req.headers.get("user-agent") ?? "dev-switch").slice(0, 255);
  const created = await createSession(userId, fingerprint);
  const rows = (await sql`
    SELECT id, name, email, phone_number, avatar_url, role
    FROM users WHERE id = ${userId} LIMIT 1`) as unknown as {
    id: string;
    name: string | null;
    email: string | null;
    phone_number: string | null;
    avatar_url: string | null;
    role: string;
  }[];

  const res = NextResponse.json({ ok: true, user: rows[0] ?? null });
  res.headers.set("Set-Cookie", sessionCookieHeader(created.id));
  return res;
}

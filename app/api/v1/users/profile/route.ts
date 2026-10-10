import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";

function toProfile(u: { name: string | null; email: string | null; phone_number: string | null; avatar_url: string | null }) {
  return { name: u.name ?? "", contact: u.phone_number ?? u.email ?? "", avatarUrl: u.avatar_url ?? null };
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  return NextResponse.json({ profile: toProfile(auth.user) });
}

export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  let body: { name?: unknown; contact?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "Body bukan JSON." } },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : null;
  const contact = typeof body.contact === "string" ? body.contact.trim().slice(0, 255) : null;
  if (name !== null && !name)
    return NextResponse.json(
      { error: { code: "INVALID_NAME", message: "Nama tidak boleh kosong." } },
      { status: 400 },
    );
  // ponytail: kontak = email bila ada @, else phone_number (kolom users PRD §5.3).
  // Update per-kolom (bukan CASE WHEN $x IS NULL) — Postgres tak bisa infer tipe param NULL.
  const email = contact && contact.includes("@") ? contact : null;
  const phone = contact && !contact.includes("@") ? contact : null;
  try {
    if (name !== null) await sql`UPDATE users SET name = ${name} WHERE id = ${auth.user.id}`;
    if (email !== null)
      await sql`UPDATE users SET email = ${email}, phone_number = NULL WHERE id = ${auth.user.id}`;
    else if (phone !== null)
      await sql`UPDATE users SET phone_number = ${phone} WHERE id = ${auth.user.id}`;
    const rows = (await sql`
      SELECT name, email, phone_number, avatar_url FROM users WHERE id = ${auth.user.id}`) as unknown as {
      name: string | null;
      email: string | null;
      phone_number: string | null;
      avatar_url: string | null;
    }[];
    return NextResponse.json({ profile: toProfile(rows[0]) });
  } catch (e) {
    // ponytail: hanya konflik unique email/phone -> 409; error lain 500 apa adanya.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: { code: "CONTACT_TAKEN", message: "Kontak sudah dipakai akun lain." } },
        { status: 409 },
      );
    console.error("PATCH /api/v1/users/profile:", e);
    return NextResponse.json(
      { error: { code: "DB_ERROR", message: "Gagal menyimpan profil." } },
      { status: 500 },
    );
  }
}

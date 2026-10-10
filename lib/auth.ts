import { randomBytes } from "node:crypto";
import { sql } from "./db";

// ponytail: auth cookie minimal di atas tabel sessions PRD §5.3. Cookie = id sesi,
// httpOnly; tanpa lib baru, tanpa JWT — validasi = row ada di DB.
export const SESSION_COOKIE = "ftai_session";
export const MAX_DEVICES = 2;

export type AuthUser = {
  id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

export type AuthContext = { user: AuthUser; sessionId: string };

function sessionIdFrom(req: Request): string | null {
  const m = /(?:^|;\s*)ftai_session=([^;]+)/u.exec(req.headers.get("cookie") ?? "");
  const v = m?.[1]?.trim().replace(/^"|"$/g, "");
  return v && /^[0-9a-f-]{8,36}$/iu.test(v) ? v : null;
}

export async function requireAuth(req: Request): Promise<AuthContext | null> {
  const sid = sessionIdFrom(req);
  if (!sid) return null;
  const rows = (await sql`
    SELECT u.id, u.name, u.email, u.phone_number, u.avatar_url
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} LIMIT 1`) as unknown as AuthUser[];
  if (!rows[0]) return null;
  await sql`UPDATE sessions SET last_active = now() WHERE id = ${sid}`;
  return { user: rows[0], sessionId: sid };
}

export function sessionCookieHeader(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function countSessions(userId: string): Promise<number> {
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = ${userId}`) as unknown as {
    n: number;
  }[];
  return rows[0]?.n ?? 0;
}

// ponytail: device ke-3 = revoke oldest dalam 1 transaksi (PRD §2/§4.2/§5.3).
// SELECT ... FOR UPDATE + DELETE + INSERT atomik — tanpa TOCTOU, tanpa 403.
export async function createSession(userId: string, fingerprint: string): Promise<{ id: string }> {
  const hash = randomBytes(32).toString("hex");
  const fp = fingerprint.slice(0, 255) || "unknown";
  const rows = (await sql.begin(async (tx: any) => {
    const existing = (await tx`
      SELECT id FROM sessions WHERE user_id = ${userId}
      ORDER BY last_active ASC FOR UPDATE`) as unknown as { id: string }[];
    if (existing.length >= MAX_DEVICES && existing[0]) {
      await tx`DELETE FROM sessions WHERE id = ${existing[0].id}`;
    }
    return (await tx`
      INSERT INTO sessions (user_id, device_fingerprint, refresh_token_hash)
      VALUES (${userId}, ${fp}, ${hash})
      RETURNING id`) as unknown as { id: string }[];
  })) as unknown as { id: string }[];
  return { id: rows[0].id };
}

export async function devSeedUserId(): Promise<string | null> {
  const rows = (await sql`
    SELECT id FROM users WHERE email = 'dev@example.com' LIMIT 1`) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

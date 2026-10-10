import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "./db";

// ponytail: auth admin bearer lintas origin (keputusan (d) TASK-021) — kasir/ui
// standalone memanggil API web/ dari origin berbeda, cookie SameSite=Lax tak cocok.
// JWT HS256 pendek umur (stdlib node:crypto, setara jose; tanpa dep baru) + refresh
// token di-hash di tabel admin_sessions (pola sessions lib/auth.ts).

export type AdminUser = {
  id: string;
  role: "kasir" | "super_admin";
  cafe_id: string | null;
};

export type AdminAuth = { user: AdminUser; sessionId: string };

export type AdminAuthError =
  | "unauthorized"
  | "forbidden-origin"
  | "forbidden-role"
  | "forbidden-cafe";

const SIGNING_KEY = process.env.ADMIN_JWT_SECRET ?? "dev-only-admin-jwt-secret";
const ACCESS_TTL_SECONDS = Number(process.env.ADMIN_ACCESS_TTL ?? 900); // 15 menit
const REFRESH_TTL_SECONDS = Number(process.env.ADMIN_REFRESH_TTL ?? 604800); // 7 hari
const MAX_REFRESH_SESSIONS = 5;

// ponytail: scrypt (harga tetap, stdlib) — bcrypt/argon2 tak ada di deps.
const PASSWORD_PEPPER = process.env.ADMIN_PASSWORD_PEPPER ?? "dev-only-pepper-TASK023";
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, SCRYPT_KEYLEN = 64;

// ---- CORS / origin ----
// ponytail: allowlist origin admin (PRD §4.1 admin.restoran.com) + dev; default
// termasuk web dev (3000) agar super-admin UI dalam repo ini ikut berfungsi.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://admin.restoran.com",
];
export function allowedOrigins(): string[] {
  const extra = (process.env.ADMIN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

export function corsHeaders(origin: string | null) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

// Return origin valid, null (non-browser: tak ada header Origin), atau "denied".
export function requireAllowedOrigin(req: Request): string | null | "denied" {
  const origin = (req.headers.get("origin") ?? "").trim() || null;
  if (!origin) return null;
  return allowedOrigins().includes(origin) ? origin : "denied";
}

// ---- JWT HS256 ----
function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function partSig(header: string, payload: string) {
  return createHmac("sha256", SIGNING_KEY).update(`${header}.${payload}`).digest();
}
export function createAccessToken(user: AdminUser): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    Buffer.from(
      JSON.stringify({ sub: user.id, role: user.role, cafe_id: user.cafe_id, iat: now, exp: now + ACCESS_TTL_SECONDS }),
    ),
  );
  return `${header}.${payload}.${b64url(partSig(header, payload))}`;
}

export type AccessClaims = {
  sub: string;
  role: "kasir" | "super_admin";
  cafe_id: string | null;
  exp: number;
};
export function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = b64url(partSig(header, payload));
  const got = sig ?? "";
  if (expected.length !== got.length) return null;
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(payload).toString("utf8")) as AccessClaims;
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (!["kasir", "super_admin"].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- Password (scrypt + salt; verifikasi deterministik harga-tetap) ----
// Format disimpan: scrypt$1$<salt-hex>$<key-hex>
export function hashPassword(password: string): string {
  if (password.length < 8 || password.length > 128)
    throw new Error("Password harus 8–128 karakter.");
  const salt = randomBytes(16);
  const key = scryptSync(password + PASSWORD_PEPPER, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const [, , saltHex, keyHex] = parts;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) return false;
  const key = scryptSync(password + PASSWORD_PEPPER, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return timingSafeEqual(key, Buffer.from(keyHex, "hex"));
}

// ---- Refresh token (raw hanya di respons; DB menyimpan hash) ----
export function issueRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  return { raw, hash, expiresAt };
}

// ponytail: login/refresh admin = 1 baris admin_sessions; kelebihan cap = evict
// paling lama (pola createSession lib/auth.ts). Bukan security boundary — abuse
// refresh sama dengan punya refresh, cap ini hanya pembatas bloat.
export async function saveRefreshSession(
  user: AdminUser,
  hash: string,
  expiresAt: Date,
  origin: string | null,
): Promise<void> {
  await sql.begin(async (tx: any) => {
    await tx`DELETE FROM admin_sessions WHERE user_id = ${user.id} AND expires_at <= now()`;
    const existing = (await tx`
      SELECT id FROM admin_sessions WHERE user_id = ${user.id}
      ORDER BY created_at DESC`) as unknown as { id: string }[];
    const overflow = existing.length - MAX_REFRESH_SESSIONS + 1;
    if (overflow > 0) {
      const victims = existing.slice(existing.length - overflow).map((s) => s.id);
      await tx`DELETE FROM admin_sessions WHERE id = ANY(${victims})`;
    }
    await tx`
      INSERT INTO admin_sessions (user_id, refresh_token_hash, origin, expires_at)
      VALUES (${user.id}, ${hash}, ${origin}, ${expiresAt})`;
  });
}

// Refresh rotation: token lama dihapus SAAT dipakai (satu pakai), lalu terbitkan
// admin_sessions baru. Return null bila refresh token invalid/expired/revoked.
export async function rotateRefreshToken(
  raw: string,
  origin: string | null,
): Promise<{ user: AdminUser; refreshToken: string; refreshHash: string; refreshExpiresAt: Date } | null> {
  const hash = createHash("sha256").update(raw).digest("hex");
  const out = (await sql.begin(async (tx: any) => {
    const s = (await tx`
      DELETE FROM admin_sessions WHERE refresh_token_hash = ${hash} AND expires_at > now()
      RETURNING user_id`) as unknown as { user_id: string }[];
    if (!s[0]) return null;
    const u = (await tx`
      SELECT id, role, cafe_id FROM users
      WHERE id = ${s[0].user_id} AND role IN ('kasir', 'super_admin')
      LIMIT 1`) as unknown as AdminUser[];
    if (!u[0]) return null;
    return u[0];
  })) as unknown as AdminUser | null;
  if (!out) return null;
  const rt = issueRefreshToken();
  await saveRefreshSession(out, rt.hash, rt.expiresAt, origin);
  return { user: out, refreshToken: rt.raw, refreshHash: rt.hash, refreshExpiresAt: rt.expiresAt };
}

// ---- Autentikasi request ----
export function bearerToken(req: Request): string | null {
  const auth = (req.headers.get("authorization") ?? "").trim();
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/u.exec(auth);
  return m ? m[1] : null;
}

// guard origin + role + (opsional) cafe milik kasir. Return AdminAuth atau kode
// error string; route memetakan kode -> status (401/403).
export async function requireAdmin(
  req: Request,
  opts: { roles?: Array<AdminUser["role"]>; cafeId?: string } = {},
): Promise<AdminAuth | AdminAuthError> {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied") return "forbidden-origin";
  const token = bearerToken(req);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) return "unauthorized";
  if (opts.roles && !opts.roles.includes(claims.role)) return "forbidden-role";
  if (opts.cafeId && claims.role !== "super_admin" && claims.cafe_id !== opts.cafeId)
    return "forbidden-cafe";
  return { user: { id: claims.sub, role: claims.role, cafe_id: claims.cafe_id }, sessionId: "" };
}

// PRD §7.1: login kasir/super_admin -> {access_token, refresh_token, user}.
// Password admin tersimpan di users.admin_password_hash (0003); non-admin di-reject.
export async function loginByPassword(
  emailOrPhone: string,
  password: string,
  origin: string | null,
): Promise<{
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
} | null> {
  const id = emailOrPhone.trim().toLowerCase();
  const rows = (await sql`
    SELECT id, role, cafe_id, admin_password_hash FROM users
    WHERE (lower(email) = ${id} OR phone_number = ${emailOrPhone.trim()})
      AND role IN ('kasir', 'super_admin')
    LIMIT 1`) as unknown as Array<AdminUser & { admin_password_hash: string | null }>;
  const row = rows[0];
  if (!row || !row.admin_password_hash || !verifyPassword(password, row.admin_password_hash))
    return null;
  const user: AdminUser = { id: row.id, role: row.role, cafe_id: row.cafe_id };
  const rt = issueRefreshToken();
  await saveRefreshSession(user, rt.hash, rt.expiresAt, origin);
  return { user, accessToken: createAccessToken(user), refreshToken: rt.raw };
}
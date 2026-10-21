// BYOK admin: API key provider disimpan AES-256-GCM di DB, tidak pernah ke client.
// Key enkripsi dari env APP_ENCRYPTION_KEY (64 hex = 32 byte) — terpisah dari DB,
// jadi kebocoran backup DB tidak serta-merta membuka isi api_key_encrypted.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // rekomendasi NIST untuk GCM

let warned = false;

function keyBytes(): Buffer {
  const raw = (process.env.APP_ENCRYPTION_KEY ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (raw) {
    // nilai non-hex yang disalahisi pengguna — hash agar tetap 32 byte & deterministik
    if (!warned) {
      warned = true;
      console.warn("[secret-box] APP_ENCRYPTION_KEY bukan 64 hex char; dipakai hash SHA-256 dari nilainya. Sebaiknya ganti (npm run gen:key).");
    }
    return createHash("sha256").update(raw).digest();
  }
  // Fallback dev: turunan DATABASE_URL supaya setup lokal jalan tanpa env tambahan.
  // PRODUKSI WAJIB set APP_ENCRYPTION_KEY — jalankan: npm run gen:key
  if (!warned) {
    warned = true;
    console.warn(
      "[secret-box] APP_ENCRYPTION_KEY belum diset — memakai kunci turunan DATABASE_URL (hanya untuk development). Jalankan: npm run gen:key",
    );
  }
  return createHash("sha256").update(`ftai-dev:${process.env.DATABASE_URL ?? "local"}`).digest();
}

/** Encrypt plain text -> "aes256gcm:<iv_b64>:<tag_b64>:<ct_b64>" */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes256gcm:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt hasil encryptSecret; melempar bila format/rusak/tag salah (tamper detected). */
export function decryptSecret(payload: string): string {
  const parts = String(payload ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== "aes256gcm") throw new Error("Format secret tidak dikenal.");
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ct = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv(ALGO, keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Tampilan aman untuk UI: "sk-…a1b2" — potongan 4 karakter terakhir saja. */
export function maskSecret(plain: string): string {
  const s = plain.trim();
  if (s.length <= 8) return "****";
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

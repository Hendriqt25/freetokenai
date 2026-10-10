import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "./db";
import { devSeedUserId, requireAuth } from "./auth";

// ponytail: billing Token atomik (PRD §4.3/§5.2). Satu UPDATE kondisional =
// pre-check + deduct atomik (tanpa race); ledger menyusul. Amount: burn
// negatif, refund/grant positif; balance_after = saldo sesudah operasi.
export class InsufficientTokensError extends Error {
  balance: number;
  constructor(balance: number) {
    super("Saldo Token tidak cukup.");
    this.balance = balance;
  }
}

export function insufficient(balance: number) {
  return NextResponse.json(
    { error: { code: "INSUFFICIENT_TOKENS", message: `Saldo Token tidak cukup (sisa ${balance}). Klaim QR dulu.` } },
    { status: 402 },
  );
}

// ponytail: PRD §6 — chat 1/10, image 3/50, video 5/200 (murah vs pro).
export function chatCost(model: string) {
  return /pro|120b/i.test(model) ? 10 : 1;
}

export function imageCost(model?: string) {
  return model === "nano-banana-pro" ? 50 : 3;
}

export function videoCost(model?: string) {
  return model === "veo-3.1-quality" ? 200 : 5;
}

export type BillingMeta = {
  apiKeyId?: string | null;
  modelId: string;
  endpointType: "chat" | "image" | "video";
  mediaUrl?: string | null;
};

export async function balanceOf(workspaceId: string): Promise<number> {
  const rows = (await sql`SELECT token_balance FROM workspaces WHERE id = ${workspaceId}`) as unknown as {
    token_balance: number;
  }[];
  return rows[0]?.token_balance ?? 0;
}

async function logBurn(workspaceId: string, cost: number, balance: number, meta: BillingMeta) {
  const usage = (await sql`
    INSERT INTO usage_logs (workspace_id, api_key_id, model_id, tokens_burned, endpoint_type, status, media_url)
    VALUES (${workspaceId}, ${meta.apiKeyId ?? null}, ${meta.modelId}, ${cost}, ${meta.endpointType}, 'success', ${meta.mediaUrl ?? null})
    RETURNING id`) as unknown as { id: string }[];
  await sql`
    INSERT INTO token_transactions (workspace_id, type, amount, balance_after, reference_type, reference_id)
    VALUES (${workspaceId}, 'burn', ${-cost}, ${balance}, 'usage_log', ${usage[0].id})`;
}

async function refund(workspaceId: string, cost: number, meta: BillingMeta) {
  const rows = (await sql`
    UPDATE workspaces SET token_balance = token_balance + ${cost}
    WHERE id = ${workspaceId} RETURNING token_balance`) as unknown as { token_balance: number }[];
  const balance = rows[0]?.token_balance ?? 0;
  const usage = (await sql`
    INSERT INTO usage_logs (workspace_id, api_key_id, model_id, tokens_burned, endpoint_type, status, media_url)
    VALUES (${workspaceId}, ${meta.apiKeyId ?? null}, ${meta.modelId}, ${cost}, ${meta.endpointType}, 'refunded', ${meta.mediaUrl ?? null})
    RETURNING id`) as unknown as { id: string }[];
  await sql`
    INSERT INTO token_transactions (workspace_id, type, amount, balance_after, reference_type, reference_id)
    VALUES (${workspaceId}, 'refund', ${cost}, ${balance}, 'usage_log', ${usage[0].id})`;
  return balance;
}

// ponytail: deduct atomik -> vendor fn() -> sukses catat burn; throw /
// respons !ok (!=402) vendor catat refund. Jangan tahan transaksi DB selama vendor call.
// PRD §5.2: deduct + usage-extend satu statement (expired -> +7d, aktif -> tetap).
export async function withTokens<T extends NextResponse>(
  workspaceId: string,
  cost: number,
  fn: () => Promise<T>,
  meta: BillingMeta,
): Promise<T> {
  const deducted = (await sql`
    UPDATE workspaces SET token_balance = token_balance - ${cost},
      expires_at = CASE WHEN expires_at < now() THEN now() + interval '7 days' ELSE expires_at END
    WHERE id = ${workspaceId} AND token_balance >= ${cost}
    RETURNING token_balance`) as unknown as { token_balance: number }[];
  if (!deducted[0]) throw new InsufficientTokensError(await balanceOf(workspaceId));
  let res: T;
  try {
    res = await fn();
  } catch (e) {
    await refund(workspaceId, cost, meta);
    throw e;
  }
  // ponytail: refund semua vendor gagal (!ok) kecuali 402 — 402 tak pernah
  // deduct (throw sebelum UPDATE), jadi refund di sini = ganda/salah.
  if (!res.ok && res.status !== 402) {
    await refund(workspaceId, cost, meta);
    return res;
  }
  await logBurn(workspaceId, cost, deducted[0].token_balance, meta);
  return res;
}

export type ValidKey = { id: string; workspace_id: string };

// ponytail: key mentah -> SHA-256 hex -> api_keys (is_active). Hash 1 arah,
// DB tak pernah simpan key asli (NFR #2).
export async function validateApiKey(raw: string): Promise<ValidKey | null> {
  const hash = createHash("sha256").update(raw).digest("hex");
  const rows = (await sql`
    SELECT ak.id, ak.workspace_id FROM api_keys ak
    WHERE ak.key_hash = ${hash} AND ak.is_active = TRUE LIMIT 1`) as unknown as ValidKey[];
  return rows[0] ?? null;
}

// ponytail: dashboard = cookie sesi -> workspace; tanpa login pakai workspace
// seed dev agar demo 1500 Token tetap jalan. Null = tak ada workspace sama sekali.
export async function workspaceIdForRequest(req: Request): Promise<string | null> {
  const auth = await requireAuth(req);
  if (auth) {
    const rows = (await sql`
      SELECT id FROM workspaces WHERE user_id = ${auth.user.id}
      ORDER BY created_at LIMIT 1`) as unknown as { id: string }[];
    if (rows[0]) return rows[0].id;
  }
  // ponytail: seed fallback hanya non-production; di production anon = null (401 di caller).
  if (process.env.NODE_ENV === "production") return null;
  const seedUser = await devSeedUserId();
  if (!seedUser) return null;
  const rows = (await sql`
    SELECT id FROM workspaces WHERE user_id = ${seedUser}
    ORDER BY created_at LIMIT 1`) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

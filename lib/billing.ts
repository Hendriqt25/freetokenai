import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "./db";
import { logReq, newRequestId } from "./obs";
import { devSeedUserId, requireAuth } from "./auth";

// ponytail: ledger dua arah (PRD §5.2) — burn saat deduct, refund saat refund,
// masing-masing SATU transaksi sql.begin dengan UPDATE workspaces-nya.
// usage-extend expires_at TIDAK ikut di-revert saat refund: sengaja (PRD §2/§5.2
// tak mengatur revert extend; token_balance ter-refund penuh).
// Jangan return array dari callback sql.begin (itu mode pipeline postgres.js).
export class InsufficientTokensError extends Error {
  balance: number;
  constructor(balance: number) {
    super("Saldo Token tidak cukup.");
    this.balance = balance;
  }
}

export function insufficient(balance: number, service: "chat" | "image" | "video" | "developer_api" = "chat") {
  const userMessage = `Saldo Token tidak cukup (sisa ${balance}). Klaim QR dulu.`;
  return NextResponse.json(
    {
      error: { code: "INSUFFICIENT_TOKENS", message: userMessage },
      gatekeeper: {
        decision: "BLOCK",
        service,
        category: "credit",
        risk_level: "low",
        reason: "Saldo workspace tidak mencukupi biaya permintaan.",
        user_message: userMessage,
      },
    },
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
  // ponytail: callback id usage_log yang baru dibuat — /api/chat menautkan
  // baris assistant chat_messages.usage_log_id (PRD §5.3). Opsional, aditif.
  onUsageLogged?: (usageId: string) => void;
};

export async function balanceOf(workspaceId: string): Promise<number> {
  const rows = (await sql`SELECT token_balance FROM workspaces WHERE id = ${workspaceId}`) as unknown as {
    token_balance: number;
  }[];
  return rows[0]?.token_balance ?? 0;
}

type Deduction = { balance: number; ledgerId: string };

async function deduct(workspaceId: string, cost: number): Promise<Deduction | null> {
  const out: Deduction | null = await sql.begin(async (tx) => {
    const rows = (await tx`
      UPDATE workspaces SET token_balance = token_balance - ${cost},
        expires_at = CASE WHEN expires_at < now() THEN now() + interval '7 days' ELSE expires_at END
      WHERE id = ${workspaceId} AND token_balance >= ${cost}
      RETURNING token_balance`) as unknown as { token_balance: number }[];
    if (!rows[0]) return null;
    const led = (await tx`
      INSERT INTO token_transactions (workspace_id, type, amount, balance_after)
      VALUES (${workspaceId}, 'burn', ${-cost}, ${rows[0].token_balance})
      RETURNING id`) as unknown as { id: string }[];
    return { balance: rows[0].token_balance, ledgerId: led[0].id };
  });
  return out;
}

async function logBurn(workspaceId: string, cost: number, meta: BillingMeta, ledgerId: string) {
  await sql.begin(async (tx) => {
    const usage = (await tx`
      INSERT INTO usage_logs (workspace_id, api_key_id, model_id, tokens_burned, endpoint_type, status, media_url)
      VALUES (${workspaceId}, ${meta.apiKeyId ?? null}, ${meta.modelId}, ${cost}, ${meta.endpointType}, 'success', ${meta.mediaUrl ?? null})
      RETURNING id`) as unknown as { id: string }[];
    await tx`
      UPDATE token_transactions SET reference_type = 'usage_log', reference_id = ${usage[0].id}
      WHERE id = ${ledgerId}`;
    meta.onUsageLogged?.(usage[0].id);
  });
}

async function refund(workspaceId: string, cost: number, meta: BillingMeta, ledgerId: string): Promise<number> {
  return sql.begin(async (tx) => {
    const rows = (await tx`
      UPDATE workspaces SET token_balance = token_balance + ${cost}
      WHERE id = ${workspaceId} RETURNING token_balance`) as unknown as { token_balance: number }[];
    const balance = rows[0]?.token_balance ?? 0;
    const usage = (await tx`
      INSERT INTO usage_logs (workspace_id, api_key_id, model_id, tokens_burned, endpoint_type, status, media_url)
      VALUES (${workspaceId}, ${meta.apiKeyId ?? null}, ${meta.modelId}, ${cost}, ${meta.endpointType}, 'refunded', ${meta.mediaUrl ?? null})
      RETURNING id`) as unknown as { id: string }[];
    await tx`
      INSERT INTO token_transactions (workspace_id, type, amount, balance_after, reference_type, reference_id)
      VALUES (${workspaceId}, 'refund', ${cost}, ${balance}, 'usage_log', ${usage[0].id})`;
    await tx`
      UPDATE token_transactions SET reference_type = 'usage_log', reference_id = ${usage[0].id}
      WHERE id = ${ledgerId}`;
    return balance;
  });
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
  const deducted = await deduct(workspaceId, cost);
  if (!deducted) throw new InsufficientTokensError(await balanceOf(workspaceId));
  // ponytail: NFR#5 — satu log per billed call (choke point semua AI routes).
  const reqId = newRequestId();
  const t0 = Date.now();
  const done = (status: number, ok: boolean, note?: string) =>
    logReq({ reqId, workspaceId, endpoint: meta.endpointType, latencyMs: Date.now() - t0, status, ok, note });
  let res: T;
  try {
    res = await fn();
  } catch (e) {
    await refund(workspaceId, cost, meta, deducted.ledgerId);
    done(500, false, "throw->refund");
    throw e;
  }
  // ponytail: refund semua vendor gagal (!ok) kecuali 402 — 402 tak pernah
  // deduct (throw sebelum UPDATE), jadi refund di sini = ganda/salah.
  if (!res.ok && res.status !== 402) {
    await refund(workspaceId, cost, meta, deducted.ledgerId);
    done(res.status, false, "fail->refund");
    return res;
  }
  await logBurn(workspaceId, cost, meta, deducted.ledgerId);
  done(res.status, true);
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
  // ponytail: seed fallback hanya non-production; production anon = null dan
  // caller WAJIB 401 tanpa panggil provider (/api/chat, /api/images/generate, /api/videos/generate).
  if (process.env.NODE_ENV === "production") return null;
  const seedUser = await devSeedUserId();
  if (!seedUser) return null;
  const rows = (await sql`
    SELECT id FROM workspaces WHERE user_id = ${seedUser}
    ORDER BY created_at LIMIT 1`) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

// ponytail: streaming metered-deduct (PRD §4.3) — pre-check min 5 token,
// provider stream, hitung incremental, stop finish_reason=token_exhausted,
// deduct presisi setelah stream (tokens_terkirim * rate/1k) dalam transaksi
// yang sama dengan chat_messages insert. Saldo tak pernah negatif.
export interface StreamMeteredResult {
  totalTokens: number;
  finishReason: "stop" | "length" | "aborted" | "token_exhausted" | "error";
  reply: string;
}

export async function withTokensStream(
  workspaceId: string,
  costPer1k: number,
  streamFn: (onChunk: (text: string, done: boolean, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }, providerFinish?: string) => void, signal: AbortSignal) => Promise<void>,
  meta: BillingMeta,
  signal: AbortSignal,
): Promise<StreamMeteredResult> {
  const balance = await balanceOf(workspaceId);
  if (balance < 5) throw new InsufficientTokensError(balance);

  const reqId = newRequestId();
  const t0 = Date.now();
  const done = (status: number, ok: boolean, note?: string) =>
    logReq({ reqId, workspaceId, endpoint: meta.endpointType, latencyMs: Date.now() - t0, status, ok, note });

  let reply = "";
  let totalTokens = 0;
  let finishReason: StreamMeteredResult["finishReason"] = "stop";

  await streamFn(
    (text, done, usage, providerFinish) => {
      if (done) {
        if (usage) totalTokens = usage.totalTokens;
        if (providerFinish === "length" || providerFinish === "MAX_TOKENS")
          finishReason = "length";
      } else {
        reply += text;
        totalTokens += countTokens(text);
        const tokensAllowed = Math.floor(balance / costPer1k) * 1000;
        if (totalTokens > tokensAllowed) {
          finishReason = "token_exhausted";
          throw new Error("TOKEN_EXHAUSTED");
        }
      }
    },
    signal,
  ).catch((e) => {
    if (e instanceof Error && e.message === "TOKEN_EXHAUSTED") {
      return;
    }
    if (signal.aborted) {
      finishReason = "aborted";
      return;
    }
    throw e;
  });

  const actualTokens = totalTokens || 0;
  const cost = Math.ceil((actualTokens / 1000) * costPer1k);

  if (cost > 0) {
    const deducted = await deduct(workspaceId, cost);
    if (!deducted) throw new InsufficientTokensError(await balanceOf(workspaceId));
    await logBurn(workspaceId, cost, meta, deducted.ledgerId);
    done(200, true);
  } else {
    done(200, true);
  }

  return { totalTokens: actualTokens, finishReason, reply };
}

function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

import { NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL, isGroqModel, isKnownChatModel } from "@/lib/chat-models";
import { sql } from "@/lib/db";
import { fetchRetryOnce } from "@/lib/obs";
import {
  chatCost,
  InsufficientTokensError,
  insufficient,
  withTokens,
  workspaceIdForRequest,
} from "@/lib/billing";

// ponytail: proxy server-only. Key TIDAK PERNAH ke client.
const GEMINI_DEFAULT = process.env.GEMINI_MODEL ?? DEFAULT_CHAT_MODEL;
const SYSTEM_ID =
  "Jawab dalam Bahasa Indonesia yang ringkas dan membantu. " +
  "Untuk jawaban yang bersifat faktual (bukan opini atau kreatif murni), akhiri dengan blok 'Referensi:' berisi 1-3 sumber relevan " +
  "(nama sumber — URL bila tahu, satu per baris). Tanpa jawaban faktual = tanpa blok referensi.";

type HistItem = { role?: unknown; content?: unknown };

async function callGroq(model: string, message: string, history: HistItem[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: { code: "NO_API_KEY", message: "GROQ_API_KEY belum diset di .env.local" } },
      { status: 500 },
    );
  // ponytail: NFR#6 — fetchRetryOnce = retry 1x transient (5xx/throw) per provider.
  const res = await fetchRetryOnce("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_ID },
        ...history
          .slice(-20)
          .map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content ?? "").slice(0, 8000),
          })),
        { role: "user", content: message },
      ],
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { error: { code: "PROVIDER_ERROR", message: data?.error?.message ?? "Groq error" } },
      { status: 502 },
    );
  const reply = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!reply)
    return NextResponse.json(
      { error: { code: "EMPTY_REPLY", message: "Jawaban kosong / diblokir filter." } },
      { status: 502 },
    );
  return NextResponse.json({ reply });
}

async function callGemini(model: string, key: string, message: string, history: HistItem[]) {
  const contents = [
    ...history.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "").slice(0, 8000) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  const res = await fetchRetryOnce(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_ID }] },
      }),
      cache: "no-store",
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { error: { code: "PROVIDER_ERROR", message: data?.error?.message ?? "Gemini error" } },
      { status: 502 },
    );
  const reply = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  if (!reply)
    return NextResponse.json(
      { error: { code: "EMPTY_REPLY", message: "Jawaban kosong / diblokir filter." } },
      { status: 502 },
    );
  return NextResponse.json({ reply });
}

// ponytail: persist 1 giliran chat (user + assistant) ke chat_sessions/
// chat_messages (PRD §5.3); assistant ditautkan usage_log_id (dari withTokens).
// Autocreate sesi + judul dari pesan pertama. Return id sesi.
async function saveChatTurn(
  wsId: string,
  sessionId: string,
  userText: string,
  reply: string,
  usageId: string | undefined,
): Promise<string> {
  const title = userText.slice(0, 60) || "Obrolan Baru";
  return (await sql.begin(async (tx: any) => {
    let sid = sessionId;
    if (sid) {
      const ok = (await tx`
        SELECT 1 FROM chat_sessions WHERE id = ${sid} AND workspace_id = ${wsId} LIMIT 1`) as unknown as unknown[];
      if (!ok[0]) sid = "";
    }
    if (!sid) {
      const created = (await tx`
        INSERT INTO chat_sessions (workspace_id, title) VALUES (${wsId}, ${title})
        RETURNING id`) as unknown as { id: string }[];
      sid = created[0].id;
    }
    await tx`INSERT INTO chat_messages (session_id, role, content) VALUES (${sid}, 'user', ${userText})`;
    await tx`
      INSERT INTO chat_messages (session_id, role, content, usage_log_id)
      VALUES (${sid}, 'assistant', ${reply}, ${usageId ?? null})`;
    await tx`
      UPDATE chat_sessions SET updated_at = now(),
        title = CASE WHEN title = 'Obrolan Baru' THEN ${title} ELSE title END
      WHERE id = ${sid}`;
    return sid;
  })) as unknown as string;
}

// ponytail: simpan giliran setelah vendor sukses, lalu kembalikan respons asli
// + session_id (dipakai klien untuk membuka /dashboard/chat/:id). Persist gagal
// TIDAK boleh menggagalkan balasan user -> cukup console.error.
async function persistAndRespond(
  res: NextResponse,
  ctx: { wsId: string; sessionId: string; message: string; usageId?: string },
) {
  let data: { reply?: string };
  try {
    data = await res.clone().json();
  } catch {
    return res;
  }
  const reply = String(data?.reply ?? "");
  if (!reply) return res;
  try {
    const sid = await saveChatTurn(ctx.wsId, ctx.sessionId, ctx.message, reply, ctx.usageId);
    return NextResponse.json({ ...data, session_id: sid });
  } catch (e) {
    console.error("chat persist failed", e);
    return res;
  }
}

export async function POST(req: Request) {
  let body: { message?: unknown; history?: HistItem[]; model?: unknown; session_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_PROMPT", message: "Body bukan JSON." } },
      { status: 400 },
    );
  }
  const message = String(body.message ?? "").trim().slice(0, 8000);
  if (!message)
    return NextResponse.json(
      { error: { code: "INVALID_PROMPT", message: "Pesan tidak boleh kosong." } },
      { status: 400 },
    );
  const model = String(body.model ?? GEMINI_DEFAULT).slice(0, 80);
  if (!isKnownChatModel(model))
    return NextResponse.json(
      { error: { code: "INVALID_MODEL", message: "Model tidak dikenal." } },
      { status: 400 },
    );
  const history = Array.isArray(body.history) ? body.history : [];
  const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 64) : "";
  // ponytail: billing Token atomik (PRD §4.3/§5.2) — 402 bila kurang,
  // refund otomatis bila provider gagal (!ok non-402)/throw. Production anon = 401 tanpa panggil provider.
  const wsId = await workspaceIdForRequest(req);
  if (!wsId) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Belum login." } },
        { status: 401 },
      );
    return runProvider(model, message, history);
  }
  let usageId: string | undefined;
  try {
    const res = await withTokens(wsId, chatCost(model), () => runProvider(model, message, history), {
      modelId: model,
      endpointType: "chat",
      onUsageLogged: (id) => {
        usageId = id;
      },
    });
    // ponytail: hanya persist saat sukses (error sudah di-refund, tak ada usage_log).
    if (res.ok) return persistAndRespond(res, { wsId, sessionId, message, usageId });
    return res;
  } catch (e) {
    if (e instanceof InsufficientTokensError) return insufficient(e.balance);
    throw e;
  }
}

function runProvider(model: string, message: string, history: HistItem[]) {
  if (isGroqModel(model)) return callGroq(model, message, history);
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return Promise.resolve(
      NextResponse.json(
        { error: { code: "NO_API_KEY", message: "GEMINI_API_KEY belum diset di .env.local" } },
        { status: 500 },
      ),
    );
  // ponytail: Gemini sering 503 high-demand -> fallback ke Groq 20b bila ada key,
  // supaya obrolan tetap dibalas selama salah satu provider hidup.
  return callGemini(model, key, message, history)
    .then(async (res) => {
      if (res.status !== 502 || !process.env.GROQ_API_KEY) return res;
      return callGroq("openai/gpt-oss-20b", message, history);
    })
    .catch(() => {
      if (process.env.GROQ_API_KEY) return callGroq("openai/gpt-oss-20b", message, history);
      throw new Error("Gagal menghubungi provider AI");
    });
}

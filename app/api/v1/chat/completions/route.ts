import { NextResponse } from "next/server";

// ponytail: gateway publik dev-mode (PRD 7.3: POST /v1/chat/completions, key rst_live_*).
// Validasi penuh (hash SHA-256, cek saldo, deduct Token) butuh DB — saat itu tiba,
// tambah di sini tanpa ubah kontrak. Bentuk request/response ikut OpenAI agar
// AI agent (LangChain, Vercel AI SDK, curl) langsung bisa pakai.

// ponytail: PRD 6 — model katalog dipetakan ke provider gratis yang sudah terbukti hidup.
const MODEL_MAP: Record<string, string> = {
  "resto-chat-fast": "openai/gpt-oss-20b",
  "resto-chat-pro": "openai/gpt-oss-120b",
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
};

// ponytail: fixed-window counter in-memory (PRD 5.2: 60 req/menit/key).
// Single-instance dev saja; produksi pakai Redis INCR+EXPIRE.
const hits = new Map<string, { count: number; window: number }>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const win = Math.floor(now / 60000);
  const h = hits.get(key);
  if (!h || h.window !== win) {
    hits.set(key, { count: 1, window: win });
    return false;
  }
  h.count += 1;
  return h.count > 60;
}

type Msg = { role?: unknown; content?: unknown };

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(rst_live_[A-Za-z0-9]{10,})$/u.exec(auth.trim());
  if (!m)
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "API key tidak valid. Generate di halaman Developer API (/dashboard/developer) lalu pakai: Authorization: Bearer rst_live_... Model: resto-chat-fast / resto-chat-pro.",
        },
      },
      { status: 401 },
    );
  const apiKey = m[1];
  if (rateLimited(apiKey))
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Maks 60 request/menit per API Key." } },
      { status: 429 },
    );

  let body: { model?: unknown; messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_PROMPT", message: "Body bukan JSON." } },
      { status: 400 },
    );
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((x) => x.role === "user");
  const message = String(lastUser?.content ?? "").trim().slice(0, 8000);
  if (!message)
    return NextResponse.json(
      { error: { code: "INVALID_PROMPT", message: "messages harus berisi pesan user." } },
      { status: 400 },
    );
  const groqModel = MODEL_MAP[String(body.model ?? "resto-chat-fast")] ?? null;
  if (!groqModel)
    return NextResponse.json(
      {
        error: {
          code: "INVALID_MODEL",
          message: "Model tidak dikenal. Pakai: resto-chat-fast, resto-chat-pro.",
        },
      },
      { status: 400 },
    );

  const key = process.env.GROQ_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: { code: "NO_API_KEY", message: "GROQ_API_KEY belum diset di server." } },
      { status: 500 },
    );
  const history = messages.slice(0, -1).slice(-20).map((x) => ({
    role: x.role === "assistant" ? "assistant" : "user",
    content: String(x.content ?? "").slice(0, 8000),
  }));
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: "system", content: "Jawab dalam Bahasa Indonesia yang ringkas dan membantu." },
        ...history,
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
  // ponytail: bentuk OpenAI — agent tak perlu adaptor khusus.
  return NextResponse.json({
    id: `chatcmpl-dev-${Date.now()}`,
    object: "chat.completion",
    model: String(body.model ?? "resto-chat-fast"),
    choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
  });
}

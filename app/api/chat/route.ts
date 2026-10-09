import { NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL, isGroqModel, isKnownChatModel } from "@/lib/chat-models";

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
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
  const res = await fetch(
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

export async function POST(req: Request) {
  let body: { message?: unknown; history?: HistItem[]; model?: unknown };
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
  if (isGroqModel(model)) return callGroq(model, message, history);
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: { code: "NO_API_KEY", message: "GEMINI_API_KEY belum diset di .env.local" } },
      { status: 500 },
    );
  // ponytail: Gemini sering 503 high-demand -> fallback ke Groq 20b bila ada key,
  // supaya obrolan tetap dibalas selama salah satu provider hidup.
  try {
    const res = await callGemini(model, key, message, history);
    if (res.status !== 502 || !process.env.GROQ_API_KEY) return res;
    return callGroq("openai/gpt-oss-20b", message, history);
  } catch {
    if (process.env.GROQ_API_KEY) return callGroq("openai/gpt-oss-20b", message, history);
    throw new Error("Gagal menghubungi provider AI");
  }
}

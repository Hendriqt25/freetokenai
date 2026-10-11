import { NextResponse } from "next/server";
import { DEFAULT_CHAT_MODEL, isGroqModel, isKnownChatModel } from "@/lib/chat-models";
import { sql } from "@/lib/db";
import { fetchRetryOnce } from "@/lib/obs";
import {
  chatCost,
  InsufficientTokensError,
  insufficient,
  withTokensStream,
  workspaceIdForRequest,
} from "@/lib/billing";

const GEMINI_DEFAULT = process.env.GEMINI_MODEL ?? DEFAULT_CHAT_MODEL;
const SYSTEM_ID =
  "Jawab dalam Bahasa Indonesia yang ringkas dan membantu. " +
  "Untuk jawaban yang bersifat faktual (bukan opini atau kreatif murni), akhiri dengan blok 'Referensi:' berisi 1-3 sumber relevan " +
  "(nama sumber — URL bila tahu, satu per baris). Tanpa jawaban faktual = tanpa blok referensi.";

type HistItem = { role?: unknown; content?: unknown };

async function streamGroq(
  model: string,
  message: string,
  history: HistItem[],
  onChunk: (text: string, done: boolean, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }) => void,
  signal: AbortSignal,
) {
  const key = process.env.GROQ_API_KEY;
  if (!key)
    throw new Error("GROQ_API_KEY belum diset di .env.local");

  const res = await fetchRetryOnce("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_ID },
        ...history.slice(-20).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content ?? "").slice(0, 8000),
        })),
        { role: "user", content: message },
      ],
      stream: true,
      cache: "no-store",
    }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Groq error");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content, false);
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? 0,
              totalTokens: parsed.usage.total_tokens ?? 0,
            };
          }
        } catch {
        }
      }
    }
  }
  onChunk("", true, usage);
}

async function streamGemini(
  model: string,
  key: string,
  message: string,
  history: HistItem[],
  onChunk: (text: string, done: boolean, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }) => void,
  signal: AbortSignal,
) {
  const contents = [
    ...history.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "").slice(0, 8000) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetchRetryOnce(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_ID }] },
        cache: "no-store",
      }),
      signal,
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message ?? "Gemini error");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) onChunk(text, false);
          if (parsed.usageMetadata) {
            usage = {
              promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
              completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
              totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
            };
          }
        } catch {
        }
      }
    }
  }
  onChunk("", true, usage);
}

async function runStreamingProvider(
  model: string,
  message: string,
  history: HistItem[],
  onChunk: (text: string, done: boolean, usage?: { promptTokens: number; completionTokens: number; totalTokens: number }) => void,
  signal: AbortSignal,
) {
  if (isGroqModel(model)) {
    await streamGroq(model, message, history, onChunk, signal);
  } else {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY belum diset di .env.local");
    await streamGemini(model, key, message, history, onChunk, signal);
  }
}

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
  const wsId = await workspaceIdForRequest(req);
  if (!wsId) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Belum login." } },
        { status: 401 },
      );
  }

  const encoder = new TextEncoder();
  let usageId: string | undefined;
  let sessionIdFinal = sessionId;

  const stream = new ReadableStream({
    async start(controller) {
      const costPer1k = chatCost(model);

      try {
        const result = await withTokensStream(
          wsId!,
          costPer1k,
          async (onChunk, signal) => {
            await runStreamingProvider(model, message, history, (text, done, usage) => {
              if (done) {
                onChunk("", true, usage);
              } else {
                onChunk(text, false);
              }
            }, signal);
          },
          {
            modelId: model,
            endpointType: "chat",
            onUsageLogged: (id) => { usageId = id; },
          },
          new AbortSignal(),
        );

        sessionIdFinal = await saveChatTurn(wsId!, sessionIdFinal, message, result.reply, usageId);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, totalTokens: result.totalTokens, finishReason: result.finishReason, sessionId: sessionIdFinal })}\n\n`));
      } catch (e) {
        if (e instanceof InsufficientTokensError) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { code: "INSUFFICIENT_TOKENS", message: `Saldo Token tidak cukup (sisa ${e.balance}). Klaim QR dulu.` } })}\n\n`));
        } else {
          const err = e instanceof Error ? e.message : "Streaming error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { code: "PROVIDER_ERROR", message: err } })}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
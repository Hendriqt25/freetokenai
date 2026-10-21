// Routing model -> penyedia platform (key super_admin) + adapter panggilan.
// Server-only: key plain hanya hidup di memori selama request.
import { listModels, listProviders, providerKey, type ModelKind } from "./model-registry";

export type ProviderFamily = "openai" | "gemini" | "vio";

export type AiRoute = {
  provider: string;
  family: ProviderFamily;
  /** root API siap pakai (sudah termasuk /v1 bila perlu) */
  base_url: string;
  key: string;
  model: string;
};

export function providerFamily(provider: string, baseUrl: string): ProviderFamily {
  const p = (provider || "").toLowerCase();
  const b = (baseUrl || "").toLowerCase();
  if (p === "gemini" || b.includes("generativelanguage")) return "gemini";
  if (p === "vio" || b.includes("viostudio")) return "vio";
  return "openai";
}

/** Normalisasi base URL per keluarga provider. */
export function providerBase(provider: string, baseUrl: string, family: ProviderFamily): string {
  const base = (baseUrl || "").replace(/\/+$/, "");
  if (family === "gemini")
    return (base || "https://generativelanguage.googleapis.com").replace(
      /\/(v1beta|v1)(\/openai)?$/i,
      "",
    );
  if (family === "vio") return base || "https://api.viostudio.id/v1";
  if (provider === "groq" || base.includes("api.groq.com")) return `${base || "https://api.groq.com"}/openai/v1`;
  if (provider === "openai") return base || "https://api.openai.com/v1";
  if (provider === "openrouter") return base || "https://openrouter.ai/api/v1";
  if (base && !/\/v\d+$/.test(base)) return `${base}/v1`;
  return base;
}

function makeRoute(input: {
  provider: string;
  baseUrl: string;
  key: string;
  model: string;
}): AiRoute {
  const family = providerFamily(input.provider, input.baseUrl);
  return {
    provider: input.provider,
    family,
    base_url: providerBase(input.provider, input.baseUrl, family),
    key: input.key,
    model: input.model,
  };
}

/**
 * Tentukan rute untuk sebuah model platform (/admin).
 * Return null bila model tidak dikenal / provider belum punya key.
 */
export async function resolveRoute(modelId: string, kind: ModelKind): Promise<AiRoute | null> {
  const model = (await listModels(kind)).find((m) => m.model_id === modelId);
  if (!model) return null;
  const providers = await listProviders();
  const provider = providers.find((p) => p.slug === model.provider_slug);

  // model lama tanpa provider: tebak dari id (slash = groq, selain itu gemini)
  if (!provider) {
    if (kind !== "chat") return null;
    const slug = modelId.includes("/") ? "groq" : "gemini";
    const key = await providerKey(slug);
    if (!key) return null;
    return makeRoute({
      provider: slug,
      baseUrl: slug === "groq" ? "https://api.groq.com" : "https://generativelanguage.googleapis.com",
      key,
      model: modelId,
    });
  }

  const key = await providerKey(provider.slug);
  if (!key) return null;
  return makeRoute({
    provider: provider.slug,
    baseUrl: provider.base_url,
    key,
    model: modelId,
  });
}

export type ChatResult = { ok: true; reply: string } | { ok: false; status: number; message: string };

export type ChatImage = { mimeType: string; data: string };

export type ChatOptions = {
  system: string;
  message: string;
  history: { role?: unknown; content?: unknown }[];
  images?: ChatImage[];
};

/** Model yang bisa menerima gambar. Gemini native; OpenAI-compatible hanya model vision umum. */
export function supportsVision(route: AiRoute): boolean {
  if (route.family === "gemini") return true;
  return /(gpt-4o|gpt-4\.1|gpt-4\.5|o3|o4|vision|llama-4|pixtral|qwen.{0,4}vl)/i.test(route.model);
}

function toOpenAiMessages(
  system: string,
  message: string,
  history: { role?: unknown; content?: unknown }[],
  images: ChatImage[] = [],
): unknown[] {
  const currentContent = images.length
    ? [
        { type: "text", text: message },
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
      ]
    : message;

  return [
    { role: "system", content: system },
    ...history.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 8000),
    })),
    { role: "user", content: currentContent },
  ];
}

function toGeminiContents(
  message: string,
  history: { role?: unknown; content?: unknown }[],
  images: ChatImage[] = [],
): { role: string; parts: unknown[] }[] {
  const parts: unknown[] = [{ text: message }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  return [
    ...history.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content ?? "").slice(0, 8000) }],
    })),
    { role: "user", parts },
  ];
}

/** Chat non-streaming (OpenAI-compatible atau Gemini). */
export async function chatComplete(route: AiRoute, opts: ChatOptions): Promise<ChatResult> {
  if (route.family === "vio") return { ok: false, status: 500, message: "Provider ini tidak mendukung chat." };

  if (route.family === "gemini") {
    const res = await fetch(`${route.base_url}/v1beta/models/${route.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": route.key },
      body: JSON.stringify({
        contents: toGeminiContents(opts.message, opts.history, opts.images),
        systemInstruction: { parts: [{ text: opts.system }] },
      }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return { ok: false, status: 502, message: String((data as { error?: { message?: string } })?.error?.message ?? "Gemini error") };
    const reply = ((data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!reply) return { ok: false, status: 502, message: "Jawaban kosong / diblokir filter." };
    return { ok: true, reply };
  }

  const res = await fetch(`${route.base_url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` },
    body: JSON.stringify({
      model: route.model,
      messages: toOpenAiMessages(opts.system, opts.message, opts.history, opts.images),
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return {
      ok: false,
      status: 502,
      message: String((data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status} dari provider`),
    };
  const reply = String(
    (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? "",
  ).trim();
  if (!reply) return { ok: false, status: 502, message: "Jawaban kosong / diblokir filter." };
  return { ok: true, reply };
}

export type StreamUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

/** Chat streaming (OpenAI SSE atau Gemini SSE). */
export async function streamChat(
  route: AiRoute,
  opts: ChatOptions,
  onChunk: (text: string, done: boolean, usage?: StreamUsage, providerFinish?: string) => void,
  signal: AbortSignal,
): Promise<void> {
  if (route.family === "vio") throw new Error("Provider ini tidak mendukung chat.");

  const url =
    route.family === "gemini"
      ? `${route.base_url}/v1beta/models/${route.model}:streamGenerateContent?alt=sse`
      : `${route.base_url}/chat/completions`;
  const headers: Record<string, string> =
    route.family === "gemini"
      ? { "Content-Type": "application/json", "x-goog-api-key": route.key }
      : { "Content-Type": "application/json", Authorization: `Bearer ${route.key}` };
  const body =
    route.family === "gemini"
      ? {
          contents: toGeminiContents(opts.message, opts.history, opts.images),
          systemInstruction: { parts: [{ text: opts.system }] },
        }
      : {
          model: route.model,
          messages: toOpenAiMessages(opts.system, opts.message, opts.history, opts.images),
          stream: true,
          stream_options: { include_usage: true },
        };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal, cache: "no-store" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(String((data as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status} dari provider`));
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Provider tidak mengirim body.");
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: StreamUsage | undefined;
  let providerFinish: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw) as {
          choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          candidates?: {
            content?: { parts?: { text?: string }[] };
            finishReason?: string;
          }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        };
        const text =
          parsed.choices?.[0]?.delta?.content ??
          parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
          "";
        if (text) onChunk(text, false);
        if (parsed.choices?.[0]?.finish_reason) providerFinish = parsed.choices[0].finish_reason ?? undefined;
        if (parsed.candidates?.[0]?.finishReason) providerFinish = parsed.candidates[0].finishReason;
        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          };
        } else if (parsed.usageMetadata) {
          usage = {
            promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
            completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
          };
        }
      } catch {
        // chunk bukan JSON lengkap -> lewati
      }
    }
  }
  onChunk("", true, usage, providerFinish);
}

// ponytail: satu daftar model untuk picker client + allowlist server.
// ponytail: default = Groq 20b yang terbukti hidup (Gemini 3.5-flash sering 503
// "high demand"). Gemini tetap bisa dipilih manual, route fallback ke Groq bila gagal.
export const CHAT_MODELS: { id: string; label: string }[] = [
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B Cepat" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
];

export const DEFAULT_CHAT_MODEL: string = CHAT_MODELS[0].id;

// ponytail: id Groq selalu "org/nama", Gemini tidak pakai slash.
export function isGroqModel(id: string) {
  return id.includes("/");
}

export function isKnownChatModel(id: string) {
  return CHAT_MODELS.some((m) => m.id === id);
}

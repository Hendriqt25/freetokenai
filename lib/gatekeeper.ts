import { NextResponse } from "next/server";

export type GatekeeperService = "chat" | "coding" | "image" | "video" | "developer_api" | "other" | "none";
export type GatekeeperCategory =
  | "allowed"
  | "context"
  | "safety"
  | "security"
  | "privacy"
  | "credential"
  | "prompt_injection"
  | "access"
  | "credit";

export type GatekeeperResult = {
  decision: "ALLOW" | "BLOCK" | "NEEDS_REVIEW";
  service: GatekeeperService;
  category: GatekeeperCategory;
  risk_level: "low" | "medium" | "high";
  reason: string;
  user_message: string;
};

type Rule = {
  category: Exclude<GatekeeperCategory, "allowed" | "context" | "access" | "credit">;
  patterns: RegExp[];
  reason: string;
  userMessage: string;
};

// Evaluated in the policy's required priority order.
const rules: Rule[] = [
  {
    category: "security",
    reason: "Permintaan memfasilitasi akses tanpa izin atau pengelakan kontrol keamanan.",
    userMessage: "Maaf, saya tidak dapat membantu akses tanpa izin atau pengelakan kontrol keamanan.",
    patterns: [
      /\b(?:bypass|circumvent|disable|evade)\b.{0,80}\b(?:authentication|authorization|security|access control|credit limit|device limit|workspace restriction|rate limit)\b/iu,
      /\b(?:hack into|break into|gain unauthorized access|steal (?:credentials|passwords?|tokens?)|phish)\b/iu,
      /\b(?:write|build|create|deploy|develop)\b.{0,40}\b(?:malware|ransomware|credential stealer|keylogger|phishing page)\b/iu,
      /\b(?:give|write|create|provide|buatkan|kasih)\b.{0,50}\b(?:script|code|kode|skrip)\b.{0,60}\b(?:exploit|sql injection|vulnerability|kerentanan)\b/iu,
      /\b(?:bypass|tembus|lewati|nonaktifkan)\b.{0,70}\b(?:autentikasi|otorisasi|keamanan|batas kredit|batas perangkat|pembatasan workspace)\b/iu,
      /\b(?:ambil|curi|sadap)\b.{0,60}\b(?:password|kata sandi|kredensial|data|akun)\b.{0,50}\b(?:website|situs|user|pengguna|orang lain)\b/iu,
    ],
  },
  {
    category: "privacy",
    reason: "Permintaan mencoba mengakses data privat milik orang lain.",
    userMessage: "Maaf, saya tidak dapat membantu mengakses data pribadi milik pengguna lain.",
    patterns: [
      /\b(?:show|read|access|download|reveal|give me|tampilkan|baca|akses|unduh|bocorkan|berikan)\b.{0,60}\b(?:another user'?s?|someone else'?s|user lain|pengguna lain|orang lain)\b.{0,60}\b(?:private|personal|conversation|chat history|files?|workspace|account|data|password|credential|token|percakapan|riwayat|berkas|akun)\b/iu,
      /\b(?:another user'?s?|someone else'?s|user lain|pengguna lain|orang lain)\b.{0,60}\b(?:private|personal|conversation|chat history|files?|workspace|account|data|password|credential|token|percakapan|riwayat|berkas|akun)\b.{0,60}\b(?:show|read|access|download|reveal|get|tampilkan|baca|akses|unduh|bocorkan|ambil)\b/iu,
      /\b(?:password|kata sandi|token|credential|kredensial|private data|data pribadi|chat history|riwayat chat)\b.{0,40}\b(?:another user|user lain|pengguna lain|orang lain)\b/iu,
    ],
  },
  {
    category: "credential",
    reason: "Permintaan mencoba memperoleh kredensial atau rahasia sistem.",
    userMessage: "Maaf, saya tidak dapat membantu memperoleh API key, token, password, atau kredensial rahasia.",
    patterns: [
      /\b(?:show|reveal|give|send|print|dump|extract|obtain|steal)\b.{0,40}\b(?:(?:the|this app'?s|application'?s) )?(?:api[ -]?key|access token|auth(?:entication)? token|session token|password|secret key|private key|database credentials?|\.env(?: file)?|environment variables?)\b/iu,
      /\b(?:tampilkan|berikan|kasih|bocorkan|ambil|cetak|ungkapkan|curi)\b.{0,40}\b(?:(?:api[ -]?key|token|password|kata sandi|kredensial|secret key|private key|\.env|env(?:ironment)? variable)(?: aplikasi ini| yang dipakai aplikasi ini)?)\b/iu,
      /\b(?:what|show me|give me|reveal)\b.{0,80}\b(?:sumopod|provider)\b.{0,40}\b(?:key|token|secret|credential)s?\b/iu,
    ],
  },
  {
    category: "prompt_injection",
    reason: "Permintaan mencoba mengubah instruksi atau mengungkap konfigurasi internal.",
    userMessage: "Maaf, saya tidak dapat memberikan instruksi atau konfigurasi internal sistem.",
    patterns: [
      /\b(?:ignore|disregard|forget|override)\b.{0,80}\b(?:all |any |the )?(?:previous|prior|system|developer) instructions\b/iu,
      /\b(?:abaikan|lupakan|langkahi|override)\b.{0,80}\b(?:semua |seluruh )?(?:instruksi|aturan)\b.{0,40}\b(?:sebelumnya|sistem|developer)\b/iu,
      /\b(?:reveal|show|print|tell me|display|tampilkan|bocorkan|ungkapkan|cetak)\b.{0,80}\b(?:system prompt|developer instructions?|hidden instructions?|internal configuration|hidden context|chain of thought|instruksi internal|prompt sistem|konfigurasi internal|konteks tersembunyi)\b/iu,
      /\b(?:disable|remove|bypass)\b.{0,60}\b(?:gatekeeper|safety rules?|credit system|workspace restrictions?)\b/iu,
    ],
  },
  {
    category: "safety",
    reason: "Permintaan meminta cara membuat alat atau rencana untuk melukai orang.",
    userMessage: "Maaf, saya tidak dapat membantu membuat rencana atau alat untuk melukai orang.",
    patterns: [
      /\b(?:how to (?:kill|poison|seriously hurt)|(?:make|build|construct) (?:a )?(?:bomb|explosive device|weapon to attack)|instructions? (?:for|to make) (?:a )?(?:bomb|explosive))\b/iu,
      /\b(?:cara (?:membunuh|meracuni|melukai)|(?:membuat|merakit) (?:bom|bahan peledak|senjata untuk menyerang))\b/iu,
    ],
  },
];

function classifyService(prompt: string, requested: GatekeeperService): GatekeeperService {
  if (requested !== "chat") return requested;
  if (/\b(?:write|create|build|debug|fix|implement|code|script|program|buatkan|bikin|debug|perbaiki|implementasikan)\b.{0,80}\b(?:code|script|program|website|app|application|component|function|api|database|kode|website|aplikasi|komponen|fungsi|basis data|sql|python|javascript|typescript|react|next\.js|laravel)\b/iu.test(prompt)) {
    return "coding";
  }
  return "chat";
}

function result(
  decision: GatekeeperResult["decision"],
  service: GatekeeperService,
  category: GatekeeperCategory,
  risk_level: GatekeeperResult["risk_level"],
  reason: string,
  user_message: string,
): GatekeeperResult {
  return { decision, service, category, risk_level, reason, user_message };
}

/** Context and service are classified locally; backend access and credit checks
 * remain authoritative in workspaceIdForRequest/validateApiKey and withTokens.
 */
export function evaluateAiRequest(prompt: string, requestedService: GatekeeperService): GatekeeperResult {
  const normalized = prompt.trim();
  const service = classifyService(normalized, requestedService);

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return result("BLOCK", service, rule.category, "high", rule.reason, rule.userMessage);
    }
  }

  // A targeted exploit request may be legitimate, but needs verified scope.
  if (/\b(?:exploit|hack|break into|bypass login|sql injection against|serang|retas)\b.{0,100}\b(?:my|our|company|customer|client|website|server|site|situs|website|server)\b/iu.test(normalized)) {
    return result(
      "NEEDS_REVIEW",
      service,
      "security",
      "medium",
      "Permintaan keamanan yang ditargetkan memerlukan validasi otorisasi dari backend.",
      "Permintaan ini memerlukan pemeriksaan otorisasi dan ruang lingkup sebelum diproses.",
    );
  }

  // General knowledge, education, writing, coding, research, and creative
  // prompts are valid workspace context by default.
  return result("ALLOW", service, "allowed", "low", "Permintaan sesuai untuk layanan yang dipilih.", "");
}

export function gatekeeperBlockResponse(result: GatekeeperResult) {
  if (result.decision === "ALLOW") return null;
  return NextResponse.json(
    {
      error: { code: result.decision === "BLOCK" ? "GATEKEEPER_BLOCKED" : "GATEKEEPER_REVIEW", message: result.user_message },
      gatekeeper: result,
    },
    { status: result.decision === "NEEDS_REVIEW" ? 422 : 403 },
  );
}

export function gatekeeperAccessResponse(
  service: GatekeeperService,
  message: string,
  errorCode = "UNAUTHORIZED",
) {
  const decision = result(
    "BLOCK",
    service,
    "access",
    "high",
    "Akun atau workspace tidak memiliki akses yang valid untuk layanan ini.",
    message,
  );
  return NextResponse.json(
    { error: { code: errorCode, message }, gatekeeper: decision },
    { status: 401 },
  );
}

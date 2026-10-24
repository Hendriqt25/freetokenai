import mammoth from "mammoth";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

// Server-only: ekstraksi file upload. Jangan import modul ini dari client.
// Vercel Functions membatasi body request 4.5 MB -> jaga total di bawah itu.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_EXTRACTED_CHARS = 200_000;

export type ExtractedUpload = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: "document" | "image";
  text: string | null;
  imageBase64: string | null;
  charCount: number;
  truncated: boolean;
};

export class FileExtractError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FileExtractError";
    this.code = code;
    this.status = status;
  }
}

const TEXT_TYPES: Record<string, string> = {
  txt: "text/plain",
  text: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  log: "text/plain",
  yml: "text/yaml",
  yaml: "text/yaml",
};

function extensionOf(name: string): string {
  const clean = name.toLowerCase().split(/[\\/]/).pop() ?? "";
  const i = clean.lastIndexOf(".");
  return i >= 0 ? clean.slice(i + 1) : "";
}

export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "file").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (base || "file").slice(0, 180);
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function hasMagic(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

function detectImageMime(buffer: Buffer): string | null {
  if (hasMagic(buffer, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (hasMagic(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
}

function capText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[... dokumen dipotong karena melebihi batas ${MAX_EXTRACTED_CHARS.toLocaleString("id-ID")} karakter ...]`,
    truncated: true,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const result = await extractPdfText(pdf, { mergePages: true });
    return String(result.text ?? "");
  } finally {
    await pdf.cleanup().catch(() => undefined);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

/**
 * Ekstrak satu file upload. Error selalu FileExtractError dengan pesan
 * berbahasa Indonesia agar bisa langsung ditampilkan di UI.
 */
export async function extractUploadedFile(file: File): Promise<ExtractedUpload> {
  const filename = sanitizeFilename(file.name || "file");
  const sizeBytes = file.size;
  const ext = extensionOf(filename);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!buffer.length) throw new FileExtractError("EMPTY_FILE", `File "${filename}" kosong.`);

  const imageMime = detectImageMime(buffer);
  if (imageMime) {
    if (sizeBytes > MAX_IMAGE_BYTES)
      throw new FileExtractError(
        "FILE_TOO_LARGE",
        `Gambar "${filename}" melebihi batas ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
        413,
      );
    return {
      filename,
      mimeType: imageMime,
      sizeBytes,
      kind: "image",
      text: null,
      imageBase64: buffer.toString("base64"),
      charCount: 0,
      truncated: false,
    };
  }

  if (sizeBytes > MAX_FILE_BYTES)
    throw new FileExtractError(
      "FILE_TOO_LARGE",
      `File "${filename}" melebihi batas ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      413,
    );

  let raw = "";
  let mimeType = file.type || "application/octet-stream";

  if (ext === "pdf" || file.type === "application/pdf") {
    if (!hasMagic(buffer, [0x25, 0x50, 0x44, 0x46]))
      throw new FileExtractError("INVALID_PDF", `File "${filename}" bukan PDF yang valid.`);
    mimeType = "application/pdf";
    try {
      raw = await extractPdf(buffer);
    } catch {
      throw new FileExtractError("PDF_PARSE_FAILED", `PDF "${filename}" gagal dibaca.`);
    }
    if (!normalizeText(raw))
      throw new FileExtractError(
        "SCANNED_PDF",
        `PDF "${filename}" tidak memiliki teks (kemungkinan hasil scan). Unggah sebagai gambar atau PDF berisi teks.`,
        422,
      );
  } else if (
    ext === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (!hasMagic(buffer, [0x50, 0x4b]))
      throw new FileExtractError("INVALID_DOCX", `File "${filename}" bukan DOCX yang valid.`);
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    try {
      raw = await extractDocx(buffer);
    } catch {
      throw new FileExtractError("DOCX_PARSE_FAILED", `DOCX "${filename}" gagal dibaca.`);
    }
  } else if (ext === "doc") {
    throw new FileExtractError(
      "UNSUPPORTED_DOC",
      `Format .doc lama belum didukung. Simpan sebagai .docx lalu unggah lagi.`,
      415,
    );
  } else if (TEXT_TYPES[ext]) {
    mimeType = TEXT_TYPES[ext];
    raw = buffer.toString("utf8");
    if (ext === "html" || ext === "htm") raw = stripHtml(raw);
  } else {
    throw new FileExtractError(
      "UNSUPPORTED_TYPE",
      `Tipe file "${filename}" belum didukung. Gunakan PDF, DOCX, TXT, MD, CSV, JSON, HTML, atau gambar PNG/JPG/WEBP.`,
      415,
    );
  }

  const text = normalizeText(raw);
  if (!text)
    throw new FileExtractError("EMPTY_TEXT", `Tidak ada teks yang bisa dibaca dari "${filename}".`, 422);

  const capped = capText(text);
  return {
    filename,
    mimeType,
    sizeBytes,
    kind: "document",
    text: capped.text,
    imageBase64: null,
    charCount: capped.text.length,
    truncated: capped.truncated,
  };
}

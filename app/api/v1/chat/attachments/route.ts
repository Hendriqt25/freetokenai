import { NextResponse } from "next/server";
import { workspaceIdForRequest } from "@/lib/billing";
import { sql } from "@/lib/db";
import {
  extractUploadedFile,
  FileExtractError,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_BYTES,
  type ExtractedUpload,
} from "@/lib/file-extract";

export const runtime = "nodejs";
export const maxDuration = 60;

type AttachmentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: "document" | "image";
  char_count: number;
};

function previewOf(text: string | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 320);
}

// Upload + ekstraksi teks. File mentah tidak disimpan; hanya teks (dokumen)
// atau base64 (gambar) yang masuk DB agar tidak bisa diakses lintas workspace.
export async function POST(req: Request) {
  const wsId = await workspaceIdForRequest(req);
  if (!wsId)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_FORM", message: "Kirim file sebagai multipart/form-data." } },
      { status: 400 },
    );
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length)
    return NextResponse.json(
      { error: { code: "NO_FILE", message: "Pilih minimal satu file." } },
      { status: 400 },
    );
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE)
    return NextResponse.json(
      {
        error: {
          code: "TOO_MANY_FILES",
          message: `Maksimal ${MAX_ATTACHMENTS_PER_MESSAGE} file per pesan.`,
        },
      },
      { status: 400 },
    );

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_BYTES)
    return NextResponse.json(
      {
        error: {
          code: "TOTAL_TOO_LARGE",
          message: `Total ukuran file terlalu besar (maks ${MAX_TOTAL_BYTES / 1024 / 1024} MB).`,
        },
      },
      { status: 413 },
    );

  try {
    const extracted: ExtractedUpload[] = [];
    for (const file of files) extracted.push(await extractUploadedFile(file));

    const rows = (await sql.begin(async (tx: any) => {
      const out: AttachmentRow[] = [];
      for (const file of extracted) {
        const inserted = (await tx`
          INSERT INTO chat_attachments
            (workspace_id, filename, mime_type, size_bytes, kind, extracted_text, image_base64, char_count)
          VALUES
            (${wsId}, ${file.filename}, ${file.mimeType}, ${file.sizeBytes}, ${file.kind},
             ${file.text}, ${file.imageBase64}, ${file.charCount})
          RETURNING id, filename, mime_type, size_bytes, kind, char_count`) as unknown as AttachmentRow[];
        if (inserted[0]) out.push(inserted[0]);
      }
      return out;
    })) as unknown as AttachmentRow[];

    return NextResponse.json({
      attachments: rows.map((row, i) => ({
        ...row,
        preview: previewOf(extracted[i]?.text ?? null),
        truncated: extracted[i]?.truncated ?? false,
      })),
    });
  } catch (e) {
    if (e instanceof FileExtractError)
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.status },
      );
    console.error("attachment upload failed", e);
    return NextResponse.json(
      { error: { code: "EXTRACT_FAILED", message: "Gagal memproses file. Coba file lain." } },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { sql } from "@/lib/db";
import { rateLimited } from "@/lib/rate-limit";

// ponytail: PRD §7.4 — QR struk publik (tanpa auth). Isi QR = claim_url,
// sama dengan yang dikembalikan POST /admin/receipts/generate.
// Cache 1 jam: kode struk + claim_url tidak berubah seumur hidup struk.

function err(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (await rateLimited(`qr:${ip}`, 30))
    return err(429, "RATE_LIMITED", "Terlalu banyak permintaan, coba lagi nanti.");

  const { code } = await params;
  const rows = (await sql`
    SELECT 1 FROM receipts WHERE code = ${code} LIMIT 1`) as unknown as unknown[];
  if (!rows[0]) return err(404, "RECEIPT_NOT_FOUND", "Struk tidak ditemukan.");

  const base = (process.env.CLAIM_BASE_URL ?? "https://app.restoran.com").replace(/\/+$/, "");
  const png = await QRCode.toBuffer(`${base}/claim?code=${encodeURIComponent(code)}`, {
    type: "png",
    width: 200,
    errorCorrectionLevel: "M",
    margin: 2,
  });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

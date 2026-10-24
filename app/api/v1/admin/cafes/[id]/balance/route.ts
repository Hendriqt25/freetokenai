import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/permissions";

// Tambah saldo prepaid cafe (topup) atau koreksi manual (adjustment).
// Konvensi ledger: amount = delta saldo (+ masuk, - keluar).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  if (typeof auth === "string") {
    const status = auth === "unauthorized" ? 401 : 403;
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya super_admin." } }, { status });
  }

  const { id } = await params;

  let body: { mode?: unknown; amount?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_BODY", message: "Body bukan JSON." } }, { status: 400 });
  }

  const mode = body.mode === "adjust" ? "adjust" : body.mode === "topup" ? "topup" : null;
  if (!mode) {
    return NextResponse.json(
      { error: { code: "INVALID_MODE", message: "mode harus 'topup' atau 'adjust'." } },
      { status: 400 },
    );
  }

  const amount = typeof body.amount === "number" && Number.isInteger(body.amount) ? body.amount : NaN;
  const MAX = 100_000_000;
  const amountOk = mode === "topup" ? amount >= 1 && amount <= MAX : amount !== 0 && Math.abs(amount) <= MAX;
  if (!amountOk) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_AMOUNT",
          message: mode === "topup" ? `Jumlah top-up 1-${MAX}.` : `Koreksi tidak boleh 0, maks ${MAX}.`,
        },
      },
      { status: 400 },
    );
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  if (mode === "adjust" && note.length < 3) {
    return NextResponse.json(
      { error: { code: "NOTE_REQUIRED", message: "Catatan koreksi wajib diisi (min. 3 karakter)." } },
      { status: 400 },
    );
  }

  try {
    const result = await sql.begin(async (tx: any) => {
      const rows = (await tx`
        SELECT id, prepaid_token_balance FROM cafes WHERE id = ${id} FOR UPDATE`) as unknown as Array<{
        id: string;
        prepaid_token_balance: number;
      }>;
      if (!rows[0]) throw new Error("CAFE_NOT_FOUND");

      const balanceAfter = rows[0].prepaid_token_balance + amount;
      if (balanceAfter < 0) throw new Error("INSUFFICIENT_BALANCE");

      await tx`UPDATE cafes SET prepaid_token_balance = ${balanceAfter} WHERE id = ${id}`;
      const inserted = (await tx`
        INSERT INTO cafe_token_transactions
          (cafe_id, type, amount, balance_after, reference_type, reference_id, created_by_user_id, note)
        VALUES (${id}, ${mode === "topup" ? "topup" : "adjustment"}, ${amount}, ${balanceAfter}, 'balance', NULL, ${auth.user.id}, ${note || null})
        RETURNING id, type, amount, balance_after, note, created_at`) as unknown as Array<{
        id: string;
        type: string;
        amount: number;
        balance_after: number;
        note: string | null;
        created_at: string;
      }>;
      return { token_balance: balanceAfter, transaction: inserted[0] };
    });

    await logAudit(auth.user.id, mode === "topup" ? "cafe.topup" : "cafe.adjust", "cafes", id, {
      amount,
      note,
      balance_after: result.token_balance,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan saldo";
    if (msg === "CAFE_NOT_FOUND")
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Cafe tidak ditemukan." } }, { status: 404 });
    if (msg === "INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: { code: "INSUFFICIENT_BALANCE", message: "Saldo akhir tidak boleh negatif." } },
        { status: 409 },
      );
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: msg } }, { status: 500 });
  }
}

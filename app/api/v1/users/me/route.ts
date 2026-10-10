import { NextResponse } from "next/server";
import { clearedSessionCookie, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logReq, newRequestId } from "@/lib/obs";

// ponytail: hak hapus data UU PDP (NFR#7) — hard delete user + cascade.
// FK tanpa ON DELETE yang mengganjal DELETE users (cek schema 0001/0002):
//   ratings.user_id -> DELETE; receipts.claimed_by/created_by_user_id (nullable -> SET NULL);
//   chat_messages.usage_log_id (nullable -> SET NULL agar hapus usage_logs tak diblokir).
// usage_logs + api_keys dihapus eksplisit (bukan andalkan urutan cascade) karena
// usage_logs.api_key_id merujuk api_keys. Sisanya ikut CASCADE: workspaces ->
// token_transactions/chat_sessions -> chat_messages, sessions, admin_sessions.
export async function DELETE(req: Request) {
  const reqId = newRequestId();
  const t0 = Date.now();
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE chat_messages SET usage_log_id = NULL WHERE usage_log_id IN (
        SELECT ul.id FROM usage_logs ul JOIN workspaces w ON w.id = ul.workspace_id
        WHERE w.user_id = ${auth.user.id})`;
    await tx`DELETE FROM ratings WHERE user_id = ${auth.user.id}`;
    // ponytail: hapus eksplisit dulu (bukan andalkan urutan cascade): usage_logs
    // dirujuk chat_messages (sudah di-NULL di atas) dan api_keys dirujuk
    // usage_logs.api_key_id — hapus usage_logs dulu, lalu api_keys, anti-23503.
    await tx`
      DELETE FROM usage_logs WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = ${auth.user.id})`;
    await tx`
      DELETE FROM api_keys WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = ${auth.user.id})`;
    await tx`UPDATE receipts SET claimed_by_user_id = NULL WHERE claimed_by_user_id = ${auth.user.id}`;
    await tx`UPDATE receipts SET created_by_user_id = NULL WHERE created_by_user_id = ${auth.user.id}`;
    await tx`DELETE FROM users WHERE id = ${auth.user.id}`;
  });
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearedSessionCookie());
  logReq({ reqId, endpoint: "DELETE /api/v1/users/me", latencyMs: Date.now() - t0, status: 200, ok: true });
  return res;
}

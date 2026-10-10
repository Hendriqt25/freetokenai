import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Belum login." } },
      { status: 401 },
    );
  const rows = (await sql`
    SELECT id, token_balance, expires_at FROM workspaces
    WHERE user_id = ${auth.user.id} ORDER BY created_at LIMIT 1`) as unknown as {
    id: string;
    token_balance: number;
    expires_at: string;
  }[];
  if (!rows[0])
    return NextResponse.json(
      { error: { code: "NO_WORKSPACE", message: "Workspace belum ada." } },
      { status: 404 },
    );
  return NextResponse.json({ workspace: rows[0] });
}

import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";

// ponytail: GET /api/v1/admin/cafes — daftar cafe + sisa kuota + akumulasi
// token granted + workspace aktif. Satu query, subselect skalar (tanpa JOIN
// fanout). Hanya super_admin; kasir -> 403 via requireAdmin roles.
export async function OPTIONS(req: Request) {
  const origin = requireAllowedOrigin(req);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const origin = requireAllowedOrigin(req);
  if (origin === "denied")
    return NextResponse.json(
      { error: { code: "FORBIDDEN_ORIGIN", message: "Origin tidak diizinkan." } },
      { status: 403, headers: corsHeaders(null) },
    );
  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  if (typeof auth === "string")
    return NextResponse.json(
      { error: { code: auth.toUpperCase(), message: "Akses super admin tidak sah." } },
      { status: auth === "unauthorized" ? 401 : 403, headers: corsHeaders(origin) },
    );
  const rows = (await sql`
    SELECT c.id, c.slug, c.name, c.prepaid_token_balance, c.is_active,
      COALESCE((SELECT SUM(amount) FROM cafe_token_transactions WHERE cafe_id = c.id AND type = 'topup'), 0)::int AS total_topup,
      COALESCE((SELECT SUM(tokens_granted) FROM receipts WHERE cafe_id = c.id), 0)::int AS total_tokens_granted,
      COALESCE((
        SELECT SUM(ul.tokens_burned) FROM usage_logs ul
        LEFT JOIN workspaces w ON w.id = ul.workspace_id
        WHERE COALESCE(ul.cafe_id, w.cafe_id) = c.id
      ), 0)::int AS total_tokens_burned,
      (SELECT COUNT(*)::int FROM workspaces WHERE cafe_id = c.id AND expires_at > now()) AS active_workspaces
    FROM cafes c
    ORDER BY c.created_at`) as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    prepaid_token_balance: number;
    is_active: boolean;
    total_topup: number;
    total_tokens_granted: number;
    total_tokens_burned: number;
    active_workspaces: number;
  }>;
  return NextResponse.json({ cafes: rows }, { headers: corsHeaders(origin) });
}

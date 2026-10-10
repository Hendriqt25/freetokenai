import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/admin-auth";
import { sql } from "@/lib/db";

// ponytail: GET /api/v1/admin/cafes/:id/usage — agregat usage_logs per cafe:
// by_endpoint (chat/image/video: count + sum tokens_burned) + by_day (30 hari
// terakhir). Atribusi via COALESCE(usage_logs.cafe_id, workspaces.cafe_id)
// (baris lama hanya punya workspace_id). Hanya super_admin.
export async function OPTIONS(req: Request) {
  const origin = requireAllowedOrigin(req);
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { id: cafeId } = await params;
  const cafes = (await sql`
    SELECT id, slug, name, prepaid_token_balance, is_active FROM cafes WHERE id = ${cafeId} LIMIT 1`) as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    prepaid_token_balance: number;
    is_active: boolean;
  }>;
  if (!cafes[0])
    return NextResponse.json(
      { error: { code: "CAFE_NOT_FOUND", message: "Cafe tidak ditemukan." } },
      { status: 404, headers: corsHeaders(origin) },
    );
  const [byEndpoint, byDay] = (await Promise.all([
    sql`
      SELECT ul.endpoint_type, COUNT(*)::int AS requests, COALESCE(SUM(ul.tokens_burned), 0)::int AS tokens_burned
      FROM usage_logs ul LEFT JOIN workspaces w ON w.id = ul.workspace_id
      WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId}
      GROUP BY ul.endpoint_type ORDER BY ul.endpoint_type`,
    sql`
      SELECT to_char(ul.created_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS requests,
        COALESCE(SUM(ul.tokens_burned), 0)::int AS tokens_burned
      FROM usage_logs ul LEFT JOIN workspaces w ON w.id = ul.workspace_id
      WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId} AND ul.created_at > now() - interval '30 days'
      GROUP BY 1 ORDER BY 1`,
  ])) as unknown as [
    Array<{ endpoint_type: string; requests: number; tokens_burned: number }>,
    Array<{ day: string; requests: number; tokens_burned: number }>,
  ];
  return NextResponse.json({ cafe: cafes[0], by_endpoint: byEndpoint, by_day: byDay }, { headers: corsHeaders(origin) });
}

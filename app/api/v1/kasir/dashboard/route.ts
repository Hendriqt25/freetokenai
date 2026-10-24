import { NextResponse } from "next/server";
import { corsHeaders, requireAdmin, requireAllowedOrigin } from "@/lib/auth";
import { sql } from "@/lib/db";

// ponytail: dashboard kasir = 1 endpoint scoped ke cafe milik kasir (JWT
// cafe_id). Atribusi usage sama seperti /admin/cafes/:id/usage:
// COALESCE(usage_logs.cafe_id, workspaces.cafe_id) untuk baris lama.
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
  const auth = await requireAdmin(req, { roles: ["kasir", "super_admin"] });
  if (typeof auth === "string")
    return NextResponse.json(
      { error: { code: auth.toUpperCase(), message: "Akses kasir tidak sah." } },
      { status: auth === "unauthorized" ? 401 : 403, headers: corsHeaders(origin) },
    );

  const cafeId = new URL(req.url).searchParams.get("cafe_id") ?? auth.user.cafe_id;
  if (!cafeId)
    return NextResponse.json(
      { error: { code: "FORBIDDEN_CAFE", message: "Akun kasir belum terikat cafe." } },
      { status: 403, headers: corsHeaders(origin) },
    );
  if (auth.user.role !== "super_admin" && cafeId !== auth.user.cafe_id)
    return NextResponse.json(
      { error: { code: "FORBIDDEN_CAFE", message: "Bukan cafe Anda." } },
      { status: 403, headers: corsHeaders(origin) },
    );

  try {
    const cafes = (await sql`
      SELECT id, name, prepaid_token_balance::int AS token_balance, is_active
      FROM cafes WHERE id = ${cafeId} LIMIT 1`) as unknown as {
      id: string; name: string; token_balance: number; is_active: boolean;
    }[];
    if (!cafes[0])
      return NextResponse.json(
        { error: { code: "CAFE_NOT_FOUND", message: "Cafe tidak ditemukan." } },
        { status: 404, headers: corsHeaders(origin) },
      );

    const [summary, byDay, byEndpoint, recent, keys, transactions] = (await Promise.all([
      sql`
        SELECT
          COALESCE(SUM(ul.tokens_burned) FILTER (WHERE ul.created_at >= current_date), 0)::int AS today_tokens,
          COUNT(*) FILTER (WHERE ul.created_at >= current_date)::int AS today_requests,
          COALESCE(SUM(ul.tokens_burned) FILTER (WHERE ul.created_at >= now() - interval '7 days'), 0)::int AS week_tokens,
          COUNT(*) FILTER (WHERE ul.created_at >= now() - interval '7 days')::int AS week_requests
        FROM usage_logs ul LEFT JOIN workspaces w ON w.id = ul.workspace_id
        WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId} AND ul.status = 'success'`,
      sql`
        SELECT to_char(ul.created_at, 'YYYY-MM-DD') AS day, COALESCE(SUM(ul.tokens_burned), 0)::int AS tokens
        FROM usage_logs ul LEFT JOIN workspaces w ON w.id = ul.workspace_id
        WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId} AND ul.status = 'success'
          AND ul.created_at >= current_date - interval '6 days'
        GROUP BY 1 ORDER BY 1`,
      sql`
        SELECT ul.endpoint_type, COUNT(*)::int AS requests, COALESCE(SUM(ul.tokens_burned), 0)::int AS tokens
        FROM usage_logs ul LEFT JOIN workspaces w ON w.id = ul.workspace_id
        WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId} AND ul.status = 'success'
          AND ul.created_at >= now() - interval '7 days'
        GROUP BY ul.endpoint_type ORDER BY tokens DESC`,
      sql`
        SELECT ul.created_at, ul.endpoint_type, ul.model_id, ul.tokens_burned, ul.status, k.key_prefix
        FROM usage_logs ul
        LEFT JOIN workspaces w ON w.id = ul.workspace_id
        LEFT JOIN api_keys k ON k.id = ul.api_key_id
        WHERE COALESCE(ul.cafe_id, w.cafe_id) = ${cafeId}
        ORDER BY ul.created_at DESC LIMIT 10`,
      sql`
        SELECT key_prefix, name, token_quota, tokens_used, expires_at, revoked_at, is_active, last_used_at
        FROM api_keys WHERE cafe_id = ${cafeId} ORDER BY created_at DESC LIMIT 100`,
      sql`
        SELECT type, amount, balance_after, note, created_at
        FROM cafe_token_transactions WHERE cafe_id = ${cafeId}
        ORDER BY created_at DESC LIMIT 5`,
    ])) as unknown as [
      { today_tokens: number; today_requests: number; week_tokens: number; week_requests: number }[],
      { day: string; tokens: number }[],
      { endpoint_type: string; requests: number; tokens: number }[],
      { created_at: string; endpoint_type: string | null; model_id: string; tokens_burned: number; status: string; key_prefix: string | null }[],
      { key_prefix: string; name: string | null; token_quota: number; tokens_used: number; expires_at: string | null; revoked_at: string | null; is_active: boolean; last_used_at: string | null }[],
      { type: string; amount: number; balance_after: number; note: string | null; created_at: string }[],
    ];

    const now = Date.now();
    const mappedKeys = keys.map((k) => ({
      ...k,
      remaining: Math.max(0, (k.token_quota ?? 0) - (k.tokens_used ?? 0)),
      status: k.revoked_at
        ? "revoked"
        : k.expires_at && new Date(k.expires_at).getTime() < now
          ? "expired"
          : !k.is_active
            ? "disabled"
            : "active",
    }));

    const byDayMap = new Map(byDay.map((d) => [d.day, d.tokens]));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { day: key, tokens: byDayMap.get(key) ?? 0 };
    });

    return NextResponse.json(
      {
        cafe: cafes[0],
        summary: summary[0] ?? { today_tokens: 0, today_requests: 0, week_tokens: 0, week_requests: 0 },
        by_day: days,
        by_endpoint: byEndpoint,
        recent,
        keys: mappedKeys,
        transactions,
        generated_at: new Date().toISOString(),
      },
      { headers: corsHeaders(origin) },
    );
  } catch (err) {
    console.error("[kasir/dashboard]", err);
    return NextResponse.json(
      { error: { code: "SERVER_ERROR", message: "Gagal memuat dashboard kasir." } },
      { status: 500, headers: corsHeaders(origin) },
    );
  }
}

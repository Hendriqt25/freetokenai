import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/secret-box";
import { discoverModels, invalidateRegistry } from "@/lib/model-registry";

// "Ambil Model" — tarik ulang daftar model dari provider (key tersimpan / env).
// Best-effort: model baru ditambahkan (ON CONFLICT DO NOTHING), yang sudah ada tidak disentuh.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, { roles: ["super_admin"] });
  if (typeof auth === "string") {
    const status = auth === "unauthorized" ? 401 : 403;
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Hanya super_admin." } }, { status });
  }
  const { id } = await params;

  const rows = (await sql`
    SELECT slug, base_url, api_key_encrypted FROM providers WHERE id = ${id} LIMIT 1`) as unknown as {
    slug: string; base_url: string; api_key_encrypted: string | null;
  }[];
  if (!rows[0])
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Provider tidak ditemukan." } }, { status: 404 });

  // key: DB dulu, fallback env (provider lama yang belum dipindah ke DB)
  let key: string | null = null;
  try {
    key = rows[0].api_key_encrypted ? decryptSecret(rows[0].api_key_encrypted) : null;
  } catch {
    key = null;
  }
  if (!key) {
    const envMap: Record<string, string | undefined> = {
      groq: process.env.GROQ_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      vio: process.env.VIO_API_KEY,
    };
    key = envMap[rows[0].slug] ?? null;
  }
  if (!key)
    return NextResponse.json(
      { error: { code: "NO_KEY", message: "Belum ada API key — isi dulu lewat form ganti key." } },
      { status: 400 },
    );

  try {
    const out = await discoverModels(rows[0].slug, rows[0].base_url, key);
    let added = 0;
    for (const m of out.models) {
      const res = await sql`
        INSERT INTO ai_models (provider_id, kind, kinds, model_id, label, cost)
        VALUES (${id}, ${m.kind}, ARRAY[${m.kind}]::varchar[], ${m.model_id}, ${m.label}, 1)
        ON CONFLICT (kind, model_id) DO NOTHING
        RETURNING id`;
      if ((res as unknown as unknown[]).length) added++;
    }
    invalidateRegistry();
    return NextResponse.json({
      ok: true,
      total: out.models.length,
      added,
      message: added ? `${added} model baru ditambahkan dari ${out.source}.` : "Semua model sudah ada di katalog.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: { code: "DISCOVER_FAILED", message: `Gagal tarik model: ${e instanceof Error ? e.message : "jaringan"}` } },
      { status: 502 },
    );
  }
}

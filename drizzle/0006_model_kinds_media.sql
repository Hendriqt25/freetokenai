-- Ceklis kegunaan model (chat/gambar/video) + job media async platform.
-- Idempoten: aman dijalankan berulang (npm run db:migrate).

-- 1) Setiap model boleh dipakai untuk lebih dari satu fitur.
ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS kinds VARCHAR(20)[] NOT NULL DEFAULT ARRAY['chat'];

-- Backfill baris lama: kinds = jenis lamanya (kecuali yang sudah diisi manual).
UPDATE ai_models
SET kinds = ARRAY[kind]
WHERE array_length(kinds, 1) = 1 AND kinds[1] = 'chat' AND kind <> 'chat';

ALTER TABLE ai_models DROP CONSTRAINT IF EXISTS ai_models_kinds_check;
ALTER TABLE ai_models
  ADD CONSTRAINT ai_models_kinds_check CHECK (kinds <@ ARRAY['chat', 'image', 'video']::varchar[]);

-- 2) Job media async (video Veo/Gemini) milik user — dipoll oleh /api/generations/[id].
--    API key provider TIDAK disimpan di sini; key hanya di tabel providers (admin).
CREATE TABLE IF NOT EXISTS media_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(30) NOT NULL,
    model_id VARCHAR(120) NOT NULL,
    operation VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    asset_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_generations_user_idx ON media_generations (user_id);

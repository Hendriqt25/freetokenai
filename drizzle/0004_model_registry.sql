-- BYOK registry: provider (API key terenkripsi AES-256-GCM) + katalog model
-- (chat/image/video) yang bisa dikelola super_admin dari UI /admin/models.
-- Idempoten (IF NOT EXISTS) seperti migrasi sebelumnya — aman diulang.
-- api_key_encrypted TIDAK PERNAH dikirim ke client; UI hanya melihat key_hint (masked).

CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255) NOT NULL DEFAULT '',
    api_key_encrypted TEXT,
    key_hint VARCHAR(64),
    is_active BOOLEAN DEFAULT TRUE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('chat', 'image', 'video')),
    model_id VARCHAR(120) NOT NULL,
    label VARCHAR(150) NOT NULL,
    cost INT NOT NULL DEFAULT 1 CHECK (cost >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (kind, model_id)
);

CREATE INDEX IF NOT EXISTS ai_models_kind_idx ON ai_models (kind, is_active);

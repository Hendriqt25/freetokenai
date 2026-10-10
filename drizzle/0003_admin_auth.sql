-- TASK-023: auth admin bearer lintas origin (keputusan (d) TASK-021).
-- Admin/kasir memakai JWT pendek umur + refresh token di-hash (pola sessions lib/auth.ts),
-- TIDAK cookie web SameSite=Lax (tidak cocok untuk admin.restoran.com beda origin).
-- Kolom password admin terpisah admin_password_hash (bukan password_hash) agar
-- guard skema-lama di scripts/db-migrate.mjs TIDAK terpicu. Idempoten (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_password_hash VARCHAR(255);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(64) UNIQUE NOT NULL,
    origin VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_id_idx ON admin_sessions (user_id);
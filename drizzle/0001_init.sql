-- PRD §5.3 — 10 tabel, SQL literal apa adanya. Source of truth: ../PRD.md §5.3.
-- Deviasi tercatat & setara:
--   * PRD `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` -> `TIMESTAMPTZ DEFAULT now()` (setara, tahan timezone).
--   * `gen_random_uuid()` built-in PostgreSQL 13+, jadi tanpa CREATE EXTENSION pgcrypto.
-- Idempoten (IF NOT EXISTS) agar `npm run db:migrate` aman diulang; guard skema lama
-- (kolom pre-PRD) ada di scripts/db-migrate.mjs.

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE,
    email VARCHAR(255) UNIQUE,
    name VARCHAR(150),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_identifier_present CHECK (phone_number IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_balance INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    last_active TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    pos_reference_id VARCHAR(100) UNIQUE,
    tokens_granted INT NOT NULL,
    is_claimed BOOLEAN DEFAULT FALSE,
    claimed_by_user_id UUID REFERENCES users(id),
    claimed_at TIMESTAMPTZ,
    workspace_id UUID REFERENCES workspaces(id),
    created_by_admin VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    name VARCHAR(100) DEFAULT 'Default Key',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id),
    model_id VARCHAR(50) NOT NULL,
    tokens_burned INT NOT NULL,
    endpoint_type VARCHAR(20) CHECK (endpoint_type IN ('chat', 'image', 'video')),
    status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed', 'refunded')),
    media_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('grant', 'burn', 'refund')),
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    reference_type VARCHAR(20) CHECK (reference_type IN ('receipt', 'usage_log')),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL DEFAULT 'Obrolan Baru',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    usage_log_id UUID REFERENCES usage_logs(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage_log_id UUID REFERENCES usage_logs(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    rating INT CHECK (rating >= 1 AND rating <= 5),
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bukan bagian kontrak PRD (PRD tidak menyebut index) — hanya kinerja lookup:
CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages (session_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);

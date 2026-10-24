-- TASK-052 (lanjutan): fondasi RBAC + API Key milik kasir.
-- Tujuan fase Admin:
--   1) permission per role & override per akun (matriks /admin/rbac bisa dicentang)
--   2) aktif/nonaktif kasir + limit penerbitan API key
--   3) API key punya kuota & masa berlaku (untuk monitoring + revoke admin)
--   4) audit trail transaksi per kasir
-- Semua idempoten (ADD COLUMN IF NOT EXISTS / IF NOT EXISTS) agar aman diulang.

-- ---------- users: status + limit penerbitan ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_active_keys INT NOT NULL DEFAULT 20;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_issue_limit INT NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS keys_issued_today INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS keys_issued_date DATE;

-- ---------- token_packages: masa berlaku ----------
ALTER TABLE token_packages ADD COLUMN IF NOT EXISTS default_expires_days INT NOT NULL DEFAULT 30;
ALTER TABLE token_packages ADD COLUMN IF NOT EXISTS max_expires_days INT NOT NULL DEFAULT 90;

-- ---------- api_keys: kuota, expiry, pemilik, audit ----------
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES token_packages(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS token_quota INT NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tokens_used INT NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_reason TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- ---------- transaksi kafe: siapa kasir yang melakukannya ----------
ALTER TABLE cafe_token_transactions
    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ---------- permission ----------
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(20) NOT NULL,
    permission_key VARCHAR(50) NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key VARCHAR(50) NOT NULL,
    allowed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, permission_key)
);

-- ---------- audit log (perubahan permission, limit, revoke) ----------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(40),
    target_id UUID,
    detail JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_cafe_idx ON api_keys (cafe_id);
CREATE INDEX IF NOT EXISTS api_keys_created_by_idx ON api_keys (created_by_user_id);
CREATE INDEX IF NOT EXISTS api_keys_expires_idx ON api_keys (expires_at);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS cafe_token_transactions_created_by_idx
    ON cafe_token_transactions (created_by_user_id);

-- ---------- default permission per role = matriks RBAC ----------
INSERT INTO role_permissions (role, permission_key, allowed) VALUES
    ('super_admin', 'kasir.crud',     TRUE),
    ('super_admin', 'apikey.list',    TRUE),
    ('super_admin', 'apikey.revoke',  TRUE),
    ('super_admin', 'package.manage', TRUE),
    ('super_admin', 'apikey.issue',   TRUE),
    ('super_admin', 'token.topup',    TRUE),
    ('super_admin', 'tx.view_own',    TRUE),
    ('super_admin', 'apikey.input',   FALSE),
    ('super_admin', 'ai.access',      FALSE),

    ('kasir', 'kasir.crud',     FALSE),
    ('kasir', 'apikey.list',    FALSE),
    ('kasir', 'apikey.revoke',  FALSE),
    ('kasir', 'package.manage', FALSE),
    ('kasir', 'apikey.issue',   TRUE),
    ('kasir', 'token.topup',    TRUE),
    ('kasir', 'tx.view_own',    TRUE),
    ('kasir', 'apikey.input',   FALSE),
    ('kasir', 'ai.access',      FALSE),

    ('customer', 'kasir.crud',     FALSE),
    ('customer', 'apikey.list',    FALSE),
    ('customer', 'apikey.revoke',  FALSE),
    ('customer', 'package.manage', FALSE),
    ('customer', 'apikey.issue',   FALSE),
    ('customer', 'token.topup',    FALSE),
    ('customer', 'tx.view_own',    FALSE),
    ('customer', 'apikey.input',   TRUE),
    ('customer', 'ai.access',      TRUE)
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------- backfill: key lama dapat kuota dari saldo workspace ----------
UPDATE api_keys k
SET token_quota = GREATEST(w.token_balance, 0),
    expires_at = COALESCE(k.expires_at, w.expires_at),
    last_used_at = COALESCE(
        k.last_used_at,
        (SELECT MAX(ul.created_at) FROM usage_logs ul WHERE ul.api_key_id = k.id)
    )
FROM workspaces w
WHERE k.workspace_id = w.id
  AND k.token_quota = 0;

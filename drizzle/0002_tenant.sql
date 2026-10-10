-- TASK-022 (plan TASK-021): skema multi-tenant cafe + kasir + paket token.
-- Lanjutan 0001 (TIDAK rewrite; 0001 tetap 10 tabel PRD). Idempoten (IF NOT EXISTS),
-- kolom baru dibuat via ALTER TABLE ... ADD COLUMN IF NOT EXISTS sehingga aman diulang
-- dan tidak menyentuh data/dev seed yang sudah ada.
-- Urutan penting: CREATE TABLE cafes/token_packages dulu (ALTER REFERENCES membutuhkannya),
-- lalu ALTER kolom-kolom pada tabel eksisting dan tambahan tabel transaksi.
-- Atribusi: workspaces/receipts/usage_logs mewarisi cafe via (a) cafe_id langsung,
-- (b) users.cafe_id -> workspaces.user_id -> usage_logs.workspace_id.

CREATE TABLE IF NOT EXISTS cafes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    prepaid_token_balance INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID REFERENCES cafes(id),
    name VARCHAR(100) NOT NULL,
    rupiah_amount INT NOT NULL,
    tokens_granted INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- catatan: password_kasir_hash TIDAK masuk 0002 (tiket TASK-023, auth bearer kasir/super
-- admin). Menambahkannya ke users akan memicu guard skema-lama di scripts/db-migrate.mjs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'kasir', 'super_admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS token_package_id UUID REFERENCES token_packages(id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);

ALTER TABLE token_transactions ADD COLUMN IF NOT EXISTS cafe_id UUID REFERENCES cafes(id);

CREATE TABLE IF NOT EXISTS cafe_token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id UUID REFERENCES cafes(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'reserve', 'refund', 'adjustment')),
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    reference_type VARCHAR(20) CHECK (reference_type IN ('receipt', 'topup')),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cafes_slug_idx ON cafes (slug);
CREATE INDEX IF NOT EXISTS token_packages_cafe_id_idx ON token_packages (cafe_id);
CREATE INDEX IF NOT EXISTS cafe_token_transactions_cafe_id_idx ON cafe_token_transactions (cafe_id);
CREATE INDEX IF NOT EXISTS receipts_cafe_id_idx ON receipts (cafe_id);
CREATE INDEX IF NOT EXISTS usage_logs_cafe_id_idx ON usage_logs (cafe_id);
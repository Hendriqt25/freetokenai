-- Saldo prepaid cafe: konvensi amount = delta (+ masuk, - keluar).
-- Idempoten: db:migrate menjalankan ulang semua file.

ALTER TABLE cafe_token_transactions ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE cafe_token_transactions
    DROP CONSTRAINT IF EXISTS cafe_token_transactions_reference_type_check;
ALTER TABLE cafe_token_transactions
    ADD CONSTRAINT cafe_token_transactions_reference_type_check
    CHECK (reference_type IN ('receipt', 'topup', 'apikey', 'balance'));

-- Baris lama hasil bug: potong kuota ditulis type='topup' dengan amount negatif.
UPDATE cafe_token_transactions
SET type = 'reserve'
WHERE type = 'topup' AND amount < 0;

-- Terbit API key dulu ditandai reference_type='receipt' padahal reference_id = api_keys.id.
UPDATE cafe_token_transactions t
SET reference_type = 'apikey'
WHERE t.reference_type = 'receipt'
  AND EXISTS (SELECT 1 FROM api_keys k WHERE k.id = t.reference_id);

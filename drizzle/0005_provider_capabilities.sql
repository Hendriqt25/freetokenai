-- BYOK v2: provider punya "kebutuhan" (capabilities) — chat/image/video —
-- ala OpenRouter: tambah provider (nama + key) -> model ditarik otomatis.
-- Kolom capabilities menyimpan daftar jenis yang boleh dilayani provider tsb.
-- Idempoten (IF NOT EXISTS) seperti migrasi sebelumnya.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS capabilities VARCHAR(20)[] NOT NULL DEFAULT ARRAY['chat'];

-- Perbaiki seed lama: kolom baru memakai default ARRAY['chat'] untuk semua baris
-- eksisting — Vio harusnya image+video, bukan chat.
UPDATE providers SET capabilities = ARRAY['image', 'video'] WHERE slug = 'vio';
UPDATE providers SET capabilities = ARRAY['chat'] WHERE slug IN ('groq', 'gemini');

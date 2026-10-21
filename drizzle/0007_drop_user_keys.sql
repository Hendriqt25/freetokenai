-- Hapus konsep API key milik user (BYOK user).
-- Sekarang API key HANYA dikelola super_admin lewat /admin/models.
-- Tabel user_models & user_provider_keys tidak dipakai lagi.

-- Lepas referensi kolom di media_generations dulu (kalau ada).
ALTER TABLE media_generations DROP COLUMN IF EXISTS user_key_id;

DROP TABLE IF EXISTS user_models;
DROP TABLE IF EXISTS user_provider_keys;

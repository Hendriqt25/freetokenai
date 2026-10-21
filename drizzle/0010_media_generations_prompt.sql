-- Tambah kolom prompt & parameter ke media_generations untuk history & regenerate
ALTER TABLE media_generations
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(10),
  ADD COLUMN IF NOT EXISTS duration INT,
  ADD COLUMN IF NOT EXISTS motion VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quality VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fps INT,
  ADD COLUMN IF NOT EXISTS reference_image_url TEXT,
  ADD COLUMN IF NOT EXISTS tokens_used INT DEFAULT 0;
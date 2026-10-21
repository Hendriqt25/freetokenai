-- Update cost untuk model yang sudah ada di DB agar cocok pricing table.
-- Hanya update yang cost=1 (seed default) agar tidak menimpa custom cost admin.

-- Chat: pro/120b = 10, flash/lite/fast = 1
UPDATE ai_models
SET cost = CASE
  WHEN model_id ILIKE '%pro%' OR model_id ILIKE '%120b%' OR model_id ILIKE '%2.5-pro%' THEN 10
  ELSE 1
END
WHERE kind = 'chat' AND cost = 1 AND is_active = TRUE;

-- Image: nano-banana-pro = 50, default = 3
UPDATE ai_models
SET cost = CASE
  WHEN model_id = 'nano-banana-pro' THEN 50
  ELSE 3
END
WHERE kind = 'image' AND cost = 1 AND is_active = TRUE;

-- Video: veo-3.1-quality = 200, veo-3.1-fast = 40, default (lite) = 5
UPDATE ai_models
SET cost = CASE
  WHEN model_id = 'veo-3.1-quality' THEN 200
  WHEN model_id = 'veo-3.1-fast' THEN 40
  ELSE 5
END
WHERE kind = 'video' AND cost = 1 AND is_active = TRUE;

-- Pastikan default model per kind benar (hanya satu is_default=true per kind)
-- Chat default: gemini-3.5-flash
UPDATE ai_models SET is_default = FALSE WHERE kind = 'chat';
UPDATE ai_models SET is_default = TRUE WHERE kind = 'chat' AND model_id = 'gemini-3.5-flash';

-- Image default: nano-banana-2
UPDATE ai_models SET is_default = FALSE WHERE kind = 'image';
UPDATE ai_models SET is_default = TRUE WHERE kind = 'image' AND model_id = 'nano-banana-2';

-- Video default: veo-3.1-lite
UPDATE ai_models SET is_default = FALSE WHERE kind = 'video';
UPDATE ai_models SET is_default = TRUE WHERE kind = 'video' AND model_id = 'veo-3.1-lite';
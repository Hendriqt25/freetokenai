-- Sinkronkan counter pemakaian API key dengan saldo workspace yang terikat.
-- Key lama terbit sebelum tokens_used diisi, jadi Monitoring API Key selalu
-- menampilkan "0 terpakai" walau workspace-nya sudah burn token.
-- Idempoten: db:migrate menjalankan ulang semua file.

UPDATE api_keys k
SET tokens_used = GREATEST(k.token_quota - GREATEST(w.token_balance, 0), 0),
    last_used_at = COALESCE(
      k.last_used_at,
      (SELECT MAX(ul.created_at) FROM usage_logs ul WHERE ul.workspace_id = w.id)
    )
FROM workspaces w
WHERE k.workspace_id = w.id
  AND k.token_quota > 0;

-- Atribusi cafe untuk baris usage lama (workspace sudah menyimpan cafe_id).
UPDATE usage_logs ul
SET cafe_id = w.cafe_id
FROM workspaces w
WHERE ul.workspace_id = w.id
  AND ul.cafe_id IS NULL
  AND w.cafe_id IS NOT NULL;

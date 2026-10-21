-- Lampiran chat (dokumen/gambar) + status akhir jawaban assistant.
-- extracted_text hanya diisi untuk dokumen; image_base64 hanya untuk gambar.
CREATE TABLE IF NOT EXISTS chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'document'
        CHECK (kind IN ('document', 'image')),
    extracted_text TEXT,
    image_base64 TEXT,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_attachments_workspace_idx ON chat_attachments (workspace_id);
CREATE INDEX IF NOT EXISTS chat_attachments_session_idx ON chat_attachments (session_id);
CREATE INDEX IF NOT EXISTS chat_attachments_message_idx ON chat_attachments (message_id);

-- stop | length | aborted | token_exhausted | error
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS finish_reason VARCHAR(30);

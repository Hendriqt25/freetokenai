import { sql } from "./db";

export class ChatTurnError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ChatTurnError";
    this.code = code;
    this.status = status;
  }
}

export type StartedTurn = {
  sessionId: string;
  userMessageId: string;
};

export type FinishReason = "stop" | "length" | "aborted" | "token_exhausted" | "error";

/** Simpan pesan user lebih dulu supaya stop/error tidak menghilangkan giliran chat. */
export async function startChatTurn(args: {
  workspaceId: string;
  sessionId: string;
  userText: string;
  attachmentIds: string[];
}): Promise<StartedTurn> {
  const title = args.userText.slice(0, 60) || "Obrolan Baru";
  const ids = [...new Set(args.attachmentIds.filter(Boolean))];

  return (await sql.begin(async (tx: any) => {
    let sid = args.sessionId;
    if (sid) {
      const owns = (await tx`
        SELECT 1 FROM chat_sessions
        WHERE id = ${sid} AND workspace_id = ${args.workspaceId} LIMIT 1`) as unknown as unknown[];
      if (!owns[0]) sid = "";
    }
    if (!sid) {
      const created = (await tx`
        INSERT INTO chat_sessions (workspace_id, title)
        VALUES (${args.workspaceId}, ${title})
        RETURNING id`) as unknown as { id: string }[];
      sid = created[0].id;
    }

    const userRows = (await tx`
      INSERT INTO chat_messages (session_id, role, content)
      VALUES (${sid}, 'user', ${args.userText})
      RETURNING id`) as unknown as { id: string }[];
    const userMessageId = userRows[0].id;

    if (ids.length) {
      const linked = (await tx`
        UPDATE chat_attachments
        SET session_id = ${sid}, message_id = ${userMessageId}
        WHERE id = ANY(${ids})
          AND workspace_id = ${args.workspaceId}
          AND message_id IS NULL
        RETURNING id`) as unknown as { id: string }[];
      if (linked.length !== ids.length)
        throw new ChatTurnError(
          "INVALID_ATTACHMENT",
          "Sebagian lampiran tidak ditemukan atau sudah dipakai. Hapus lalu unggah ulang.",
        );
    }

    await tx`
      UPDATE chat_sessions SET updated_at = now(),
        title = CASE WHEN title = 'Obrolan Baru' THEN ${title} ELSE title END
      WHERE id = ${sid}`;

    return { sessionId: sid, userMessageId };
  })) as unknown as StartedTurn;
}

/** Insert jawaban baru, atau append ke jawaban lama untuk fitur Lanjutkan. */
export async function finishAssistantTurn(args: {
  workspaceId: string;
  sessionId: string;
  reply: string;
  usageId?: string;
  finishReason: FinishReason;
  appendToMessageId?: string;
}): Promise<string> {
  return (await sql.begin(async (tx: any) => {
    let messageId = "";
    if (args.appendToMessageId) {
      const updated = (await tx`
        UPDATE chat_messages
        SET content = CASE WHEN ${args.reply} = '' THEN content ELSE content || ${args.reply} END,
            finish_reason = ${args.finishReason},
            usage_log_id = COALESCE(usage_log_id, ${args.usageId ?? null})
        WHERE id = ${args.appendToMessageId}
          AND session_id = ${args.sessionId}
          AND role = 'assistant'
        RETURNING id`) as unknown as { id: string }[];
      if (!updated[0])
        throw new ChatTurnError("NOT_FOUND", "Pesan assistant tidak ditemukan untuk dilanjutkan.", 404);
      messageId = updated[0].id;
    } else {
      const inserted = (await tx`
        INSERT INTO chat_messages (session_id, role, content, usage_log_id, finish_reason)
        VALUES (${args.sessionId}, 'assistant', ${args.reply}, ${args.usageId ?? null}, ${args.finishReason})
        RETURNING id`) as unknown as { id: string }[];
      messageId = inserted[0].id;
    }

    await tx`UPDATE chat_sessions SET updated_at = now() WHERE id = ${args.sessionId}`;
    return messageId;
  })) as unknown as string;
}

export type AssistantMessageRow = {
  id: string;
  content: string;
  finish_reason: string | null;
  created_at: string;
};

export async function loadLastAssistant(
  workspaceId: string,
  sessionId: string,
): Promise<AssistantMessageRow | null> {
  const owns = (await sql`
    SELECT 1 FROM chat_sessions
    WHERE id = ${sessionId} AND workspace_id = ${workspaceId} LIMIT 1`) as unknown as unknown[];
  if (!owns[0]) return null;

  const rows = (await sql`
    SELECT id, content, finish_reason, created_at
    FROM chat_messages
    WHERE session_id = ${sessionId} AND role = 'assistant'
    ORDER BY created_at DESC, id DESC
    LIMIT 1`) as unknown as AssistantMessageRow[];
  return rows[0] ?? null;
}

/** History sebelum pesan assistant terakhir (untuk continue), urut lama -> baru. */
export async function loadHistoryBefore(
  sessionId: string,
  beforeMessageId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = (await sql`
    SELECT role, content FROM chat_messages
    WHERE session_id = ${sessionId}
      AND (created_at, id) < (
        SELECT created_at, id FROM chat_messages WHERE id = ${beforeMessageId} LIMIT 1
      )
    ORDER BY created_at ASC, id ASC`) as unknown as { role: "user" | "assistant"; content: string }[];
  return rows.slice(-20);
}

"use client";

import { Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { appendChatMessage, CHAT_CHANGED, CHAT_NEW, createChatSession, getChatMessages } from "@/lib/chat-history";
import { CHAT_JOBS_CHANGED, isChatRunning, startChatJob, stopChatJob, subscribeChatJobs } from "@/lib/chat-jobs";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { getAppSettings } from "@/lib/settings";
import { mockWorkspace, suggestionCards } from "@/lib/mock-data";
import ChatInput from "./ChatInput";
import SuggestionCard from "./SuggestionCard";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
};

// ponytail: markdown-lite tanpa dep baru — cukup bold/italic/code + link, yang lain tampil polos.
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^https?:\/\//.test(part))
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline break-all"
        >
          {part}
        </a>
      );
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*"))
      return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`"))
      return (
        <code
          key={key}
          className="rounded bg-neutral-100 px-1 py-0.5 text-[13px] dark:bg-neutral-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    return <span key={key}>{part}</span>;
  });
}

// ponytail: potong ekor "Referensi:" dari jawaban AI jadi blok sumber tersendiri.
function splitReferences(text: string): { body: string; refs: string[] } {
  const m = text.match(/\n\s*(?:\*\*)?Referensi(?:-sumber)?(?:\*\*)?\s*:?\s*\n?([\s\S]*)$/i);
  if (!m) return { body: text, refs: [] };
  const refs = m[1]
    .split("\n")
    .map((l) => l.replace(/^[\s*\-\d.)\]•]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!refs.length) return { body: text, refs: [] };
  return { body: text.slice(0, m.index).trimEnd(), refs };
}

function AssistantBubble({ text, isError }: { text: string; isError?: boolean }) {
  const { body, refs } = splitReferences(text);
  return (
    <div
      className={`max-w-none whitespace-pre-wrap text-[15px] leading-relaxed ${
        isError
          ? "text-red-600 dark:text-red-400"
          : "text-neutral-800 dark:text-neutral-200"
      }`}
    >
      {renderInline(body, "a")}
      {refs.length > 0 && (
        <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Referensi
          </p>
          <ul className="flex flex-col gap-1">
            {refs.map((r, i) => (
              <li key={i} className="text-[13px] leading-relaxed">
                <span className="mr-1.5 text-neutral-400">{i + 1}.</span>
                {renderInline(r, `ref-${i}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-1.5 text-neutral-400 dark:text-neutral-500">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl bg-primary-soft px-4 py-2.5 text-[15px] text-neutral-900 dark:bg-neutral-800 dark:text-white">
        {text}
      </div>
    </div>
  );
}

export default function ChatPanel({ sessionId }: { sessionId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [model, setModel] = useState(() => {
    try {
      return getAppSettings().defaultModel;
    } catch {
      return DEFAULT_CHAT_MODEL;
    }
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function reloadMessages(id: string) {
    setMessages(
      getChatMessages(id).map((m) => ({ id: m.id, role: m.role, text: m.content })),
    );
    setIsSending(isChatRunning(id));
  }

  // ponytail: buka sesi lama = muat chat_messages-nya (PRD 7.4).
  // Job latar yang selesai saat user di page lain ikut masuk via subscription.
  useEffect(() => {
    if (!sessionId) return;
    reloadMessages(sessionId);
    const refresh = () => reloadMessages(sessionId);
    const unsub = subscribeChatJobs(refresh);
    window.addEventListener(CHAT_CHANGED, refresh);
    window.addEventListener(CHAT_JOBS_CHANGED, refresh);
    return () => {
      unsub();
      window.removeEventListener(CHAT_CHANGED, refresh);
      window.removeEventListener(CHAT_JOBS_CHANGED, refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ponytail: Obrolan Baru saat sudah di /dashboard = reset draft.
  useEffect(() => {
    if (sessionId) return;
    const reset = () => setMessages([]);
    window.addEventListener(CHAT_NEW, reset);
    return () => window.removeEventListener(CHAT_NEW, reset);
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // ponytail: klik kotak saat loading = stop job yang jalan (di module, bukan ref).
  function handleStop() {
    if (sessionId) stopChatJob(sessionId);
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (sessionId && isChatRunning(sessionId)) return;
    // ponytail: request dilempar ke job module-scope — pindah page tidak membatalkan.
    // Chat baru: sesi dibuat dulu lalu langsung pindah halaman; balasan menyusul
    // via storage + subscription (tak perlu tunggu fetch selesai seperti dulu).
    let id = sessionId;
    let isNew = false;
    if (!id) {
      id = createChatSession().id;
      isNew = true;
    }
    const target = id;
    const userMsg = { id: crypto.randomUUID(), role: "user" as const, text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    appendChatMessage(target, "user", trimmed);
    setIsSending(true);
    startChatJob({
      sessionId: target,
      message: trimmed,
      // ponytail: chat via proxy server /api/chat (key aman di server), bawa 20 pesan terakhir.
      history: [...messages, userMsg].slice(-21, -1).map((m) => ({ role: m.role, content: m.text })),
      model,
    });
    if (isNew) router.replace(`/dashboard/chat/${target}`);
  }

  if (messages.length === 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-6 pb-4 md:px-6 md:pt-10 lg:pt-12 lg:pb-8">
        {/* Badge + headline tetap di area tengah-atas */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-1.5 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
            <Wand2 size={14} className="text-primary" />
            Aktif Sampai {mockWorkspace.expiresAtLabel}
          </span>

          <h1 className="text-center text-2xl font-medium text-neutral-900 md:text-4xl dark:text-white">
            Mau mulai dari mana hari ini?
          </h1>
        </div>

        {/* Kartu shortcut + chat input + disclaimer nempel di paling bawah */}
        <div className="flex flex-col gap-3 lg:gap-4">
          {/* ponytail: grid 3 kolom di semua ukuran — ikut mengecil, tanpa geser. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
            {suggestionCards.map((card) => (
              <SuggestionCard key={card.title} {...card} />
            ))}
          </div>

          <ChatInput onSend={handleSend} onStop={handleStop} isSending={isSending} model={model} onModelChange={setModel} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="no-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} text={message.text} />
            ) : (
              <AssistantBubble key={message.id} text={message.text} isError={message.isError} />
            ),
          )}
          {isSending && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6">
        <ChatInput onSend={handleSend} onStop={handleStop} isSending={isSending} model={model} onModelChange={setModel} compact />
      </div>
    </div>
  );
}

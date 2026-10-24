"use client";

import {
  AlertCircle,
  Check,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import type { ChatAttachment } from "@/lib/chat-history";
import { fetchCatalogModels, type CatalogModel } from "@/lib/model-catalog";
import { useT, type TKey } from "@/lib/i18n";
import ModelPicker from "./ModelPicker";

type DraftAttachment = {
  key: string;
  id?: string;
  filename: string;
  size: number;
  kind: "document" | "image";
  status: "uploading" | "ready" | "error";
  error?: string;
  previewUrl?: string;
};

type UploadResponse = {
  attachments?: {
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    kind: "document" | "image";
    char_count: number;
  }[];
  error?: { message?: string };
};

const MAX_FILES = 5;
// Vercel Functions: body request maks 4.5 MB -> samakan batas UI dengan server.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPT_FILES =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.log,.yml,.yaml,image/png,image/jpeg,image/webp";

function isImageName(name: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(name);
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const ATTACH_OPTIONS: { key: string; label: TKey; description: TKey; icon: typeof Paperclip }[] = [
  {
    key: "file",
    label: "input.uploadFile",
    description: "input.uploadDesc",
    icon: Paperclip,
  },
];

export default function ChatInput({
  onSend,
  onStop,
  isSending,
  model = DEFAULT_CHAT_MODEL,
  onModelChange,
  autoFocus,
  compact,
}: {
  onSend?: (text: string, attachments: ChatAttachment[]) => Promise<boolean> | boolean | void;
  onStop?: () => void;
  isSending?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  autoFocus?: boolean;
  /** Satu baris sejajar tombol, dipakai setelah percakapan mulai — mirip AI chat pada umumnya. */
  compact?: boolean;
}) {
  const { t } = useT();
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [attachError, setAttachError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // picker model chat dari katalog /admin (fallback CHAT_MODELS lama bila API mati)
  const [catalog, setCatalog] = useState<CatalogModel[]>(CHAT_MODELS.map((m) => ({ ...m, cost: 1 })));
  useEffect(() => {
    void fetchCatalogModels("chat").then(setCatalog);
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compactTextareaRef = useRef<HTMLTextAreaElement>(null);

  const COMPACT_MIN_HEIGHT = 36; // = h-9, sejajar tombol +/kirim
  const COMPACT_MAX_HEIGHT = 160; // ~sebesar card sebelum dibikin sebaris

  // Compact: mulai sebaris kecil, tapi tetap bisa membesar mengikuti isi —
  // misalnya saat user paste teks panjang/beberapa paragraf sekaligus.
  useEffect(() => {
    if (!compact) return;
    const el = compactTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, COMPACT_MIN_HEIGHT), COMPACT_MAX_HEIGHT)}px`;
  }, [value, compact]);

  // Tutup menu saat klik di luar area tombol "+" / popup, atau saat tekan Escape.
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleAttachOption() {
    setMenuOpen(false);
    fileInputRef.current?.click();
  }

  function patchAttachment(key: string, patch: Partial<DraftAttachment>) {
    setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  async function uploadOne(draft: DraftAttachment, file: File) {
    const form = new FormData();
    form.append("files", file);
    try {
      const res = await fetch("/api/v1/chat/attachments", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as UploadResponse;
      if (!res.ok) throw new Error(data.error?.message ?? t("input.uploadFailed", { status: res.status }));
      const uploaded = data.attachments?.[0];
      if (!uploaded) throw new Error(t("input.noAttachment"));
      patchAttachment(draft.key, {
        id: uploaded.id,
        filename: uploaded.filename,
        size: uploaded.size_bytes,
        kind: uploaded.kind,
        status: "ready",
      });
    } catch (e) {
      patchAttachment(draft.key, {
        status: "error",
        error: e instanceof Error ? e.message : t("input.uploadFailedShort"),
      });
    }
  }

  function addFiles(fileList: FileList | File[]) {
    setAttachError("");
    const incoming = Array.from(fileList);
    const room = MAX_FILES - attachments.length;
    if (room <= 0) {
      setAttachError(t("input.maxFiles", { n: MAX_FILES }));
      return;
    }

    const accepted: { draft: DraftAttachment; file: File }[] = [];
    for (const file of incoming.slice(0, room)) {
      const image = isImageName(file.name) || file.type.startsWith("image/");
      const limit = image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (file.size > limit) {
        setAttachError(t("input.tooLarge", { name: file.name, size: sizeLabel(limit) }));
        continue;
      }
      accepted.push({
        file,
        draft: {
          key: crypto.randomUUID(),
          filename: file.name,
          size: file.size,
          kind: image ? "image" : "document",
          status: "uploading",
          previewUrl: image ? URL.createObjectURL(file) : undefined,
        },
      });
    }

    if (incoming.length > room) setAttachError(t("input.roomLeft", { n: room }));
    if (!accepted.length) return;

    setAttachments((prev) => [...prev, ...accepted.map((a) => a.draft)]);
    for (const { draft, file } of accepted) void uploadOne(draft, file);
  }

  function removeAttachment(key: string) {
    const target = attachments.find((a) => a.key === key);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    if (target?.id)
      void fetch(`/api/v1/chat/attachments/${target.id}`, { method: "DELETE" }).catch(() => undefined);
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  function clearAttachments() {
    for (const a of attachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    setAttachments([]);
    setAttachError("");
  }

  async function handleSend() {
    const trimmed = value.trim();
    const uploading = attachments.some((a) => a.status === "uploading");
    if (!trimmed || uploading || isSending || submitting) return;

    const ready = attachments
      .filter((a) => a.status === "ready" && a.id)
      .map((a) => ({
        id: a.id as string,
        filename: a.filename,
        mime_type: "",
        size_bytes: a.size,
        kind: a.kind,
        char_count: 0,
      }));
    setSubmitting(true);
    try {
      const accepted = await onSend?.(trimmed, ready);
      if (accepted === false) return;
      setValue("");
      clearAttachments();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  const attachMenu = (
    <div ref={menuRef} className="relative hidden shrink-0 sm:block">
      {menuOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {ATTACH_OPTIONS.map(({ key, label, description, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleAttachOption()}
              className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary dark:bg-neutral-700 dark:text-white">
                <Icon size={16} />
              </span>
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  {t(label)}
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {t(description)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? t("input.closeMenu") : t("input.addAttachment")}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          menuOpen
            ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        }`}
      >
        <Plus
          size={18}
          className={`transition-transform duration-200 ease-out ${
            menuOpen ? "rotate-45" : "rotate-0"
          }`}
        />
      </button>
    </div>
  );

  const mobileAttachButton = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      aria-label={t("input.uploadAria")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 sm:hidden"
    >
      <Plus size={18} />
    </button>
  );

  const attachmentsBar = (
    <div className="flex w-full flex-col gap-1.5">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.key}
              className={`flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                a.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  : "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              }`}
              title={a.error}
            >
              {a.kind === "image" && a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.previewUrl} alt="" className="h-5 w-5 rounded object-cover" />
              ) : (
                <FileText size={13} className="shrink-0" />
              )}
              <span className="max-w-[9rem] truncate">{a.filename}</span>
              <span className="shrink-0 text-[10px] text-neutral-400">{sizeLabel(a.size)}</span>
              {a.status === "uploading" && <Loader2 size={12} className="shrink-0 animate-spin" />}
              {a.status === "ready" && <Check size={12} className="shrink-0 text-green-600 dark:text-green-400" />}
              {a.status === "error" && <AlertCircle size={12} className="shrink-0" />}
              <button
                type="button"
                onClick={() => removeAttachment(a.key)}
                aria-label={t("input.removeFile", { name: a.filename })}
                className="shrink-0 rounded-full p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {attachError && <p className="text-xs text-red-600 dark:text-red-400">{attachError}</p>}
    </div>
  );

  // ponytail: saat loading tombol kirim jadi kotak stop — klik = pause request.
  const sendButton = isSending ? (
    <button
      type="button"
      onClick={onStop}
      aria-label={t("input.stop")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover"
    >
      <Square size={14} fill="currentColor" />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void handleSend()}
      disabled={
        value.trim().length === 0 ||
        submitting ||
        attachments.some((a) => a.status === "uploading")
      }
      aria-label={t("input.send")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Send size={15} />
    </button>
  );

  const modelSelect = (
    <ModelPicker
      models={catalog}
      value={model}
      onChange={(id) => onModelChange?.(id)}
      disabled={isSending}
      priceNote={t("input.priceNote")}
    />
  );

  const hiddenFileInputs = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept={ACCEPT_FILES}
      className="hidden"
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (compact) {
    return (
      <div className="w-full">
        {(attachments.length > 0 || attachError) && <div className="mb-2">{attachmentsBar}</div>}
        <div className="flex w-full items-end gap-1.5 rounded-3xl border border-neutral-200 bg-white py-1.5 pl-1.5 pr-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {attachMenu}
          {mobileAttachButton}

          <textarea
            ref={compactTextareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            autoFocus={autoFocus}
            placeholder={t("input.placeholder")}
            className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-6 text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
            style={{ height: 36 }}
          />

          {modelSelect}
          {sendButton}
        </div>
        <p className="mt-2 text-center text-xs text-neutral-400">
          {t("input.disclaimer")}{" "}
          <a href="/terms" className="font-medium text-neutral-600 underline dark:text-neutral-300">
            {t("input.terms")}
          </a>
        </p>
        {hiddenFileInputs}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {attachmentsBar}
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          autoFocus={autoFocus}
          placeholder={t("input.placeholder")}
          className="w-full resize-none bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
        />
        <div className="flex items-center justify-between">
          {attachMenu}
          {mobileAttachButton}
          <div className="flex items-center gap-1.5">
            {modelSelect}
            {sendButton}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-neutral-400">
        {t("input.disclaimer")}{" "}
        <a href="/terms" className="font-medium text-neutral-600 underline dark:text-neutral-300">
          {t("input.terms")}
        </a>
      </p>

      {hiddenFileInputs}
    </div>
  );
}

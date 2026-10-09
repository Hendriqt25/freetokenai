"use client";

import { ChevronDown, ImageIcon, Paperclip, Plus, Send, Square, VideoIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";

const ATTACH_OPTIONS = [
  {
    key: "file",
    label: "Upload File",
    description: "Dokumen, PDF, atau file lainnya",
    icon: Paperclip,
  },
  {
    key: "image",
    label: "Buat Gambar",
    description: "Generate gambar pakai Token AI",
    icon: ImageIcon,
  },
  {
    key: "video",
    label: "Buat Video",
    description: "Generate video pakai Token AI",
    icon: VideoIcon,
  },
] as const;

export default function ChatInput({
  onSend,
  onStop,
  isSending,
  model = DEFAULT_CHAT_MODEL,
  onModelChange,
  autoFocus,
  compact,
}: {
  onSend?: (text: string) => void;
  onStop?: () => void;
  isSending?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  autoFocus?: boolean;
  /** Satu baris sejajar tombol, dipakai setelah percakapan mulai — mirip AI chat pada umumnya. */
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobilePhotoInputRef = useRef<HTMLInputElement>(null);
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

  function handleAttachOption(key: (typeof ATTACH_OPTIONS)[number]["key"]) {
    setMenuOpen(false);
    if (key === "file") {
      fileInputRef.current?.click();
    }
    // "image" / "video" — placeholder untuk switch mode Image/Video Generation
    // (Section 4.3 PRD), belum ada logic nyata di tahap UI slicing ini.
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
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
              onClick={() => handleAttachOption(key)}
              className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary dark:bg-neutral-700 dark:text-white">
                <Icon size={16} />
              </span>
              <span>
                <span className="block text-sm font-medium text-neutral-900 dark:text-white">
                  {label}
                </span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                  {description}
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
        aria-label={menuOpen ? "Tutup menu lampiran" : "Tambah lampiran"}
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
      onClick={() => mobilePhotoInputRef.current?.click()}
      aria-label="Upload foto"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800 sm:hidden"
    >
      <Plus size={18} />
    </button>
  );

  // ponytail: saat loading tombol kirim jadi kotak stop — klik = pause request.
  const sendButton = isSending ? (
    <button
      type="button"
      onClick={onStop}
      aria-label="Hentikan jawaban"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover"
    >
      <Square size={14} fill="currentColor" />
    </button>
  ) : (
    <button
      type="button"
      onClick={handleSend}
      disabled={value.trim().length === 0}
      aria-label="Kirim pesan"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Send size={15} />
    </button>
  );

  const modelSelect = (
    <div className="relative shrink-0">
      <select
        value={model}
        onChange={(event) => onModelChange?.(event.target.value)}
        disabled={isSending}
        aria-label="Pilih model"
        className="h-9 max-w-[6.5rem] cursor-pointer appearance-none truncate rounded-full border border-neutral-200 bg-transparent pl-3 pr-7 text-xs text-neutral-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-[8.5rem] dark:border-neutral-700 dark:text-neutral-300"
      >
        {CHAT_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"
      />
    </div>
  );

  const hiddenFileInputs = (
    <>
      {/* Desktop: file umum (dokumen/PDF/gambar/video) lewat opsi "Upload File" di menu. */}
      <input ref={fileInputRef} type="file" multiple className="hidden" />
      {/* Mobile: langsung foto/galeri, tanpa menu perantara. */}
      <input ref={mobilePhotoInputRef} type="file" accept="image/*" className="hidden" />
    </>
  );

  if (compact) {
    return (
      <div className="w-full">
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
            placeholder="Ketik apa saja — pertanyaan, tugas, atau ide mentah..."
            className="min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-sm leading-6 text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white"
            style={{ height: 36 }}
          />

          {modelSelect}
          {sendButton}
        </div>
        <p className="mt-2 text-center text-xs text-neutral-400">
          RestoAI bisa keliru. Periksa info penting.{" "}
          <a href="/terms" className="font-medium text-neutral-600 underline dark:text-neutral-300">
            Ketentuan Token
          </a>
        </p>
        {hiddenFileInputs}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          autoFocus={autoFocus}
          placeholder="Ketik apa saja — pertanyaan, tugas, atau ide mentah..."
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
        RestoAI bisa keliru. Periksa info penting.{" "}
        <a href="/terms" className="font-medium text-neutral-600 underline dark:text-neutral-300">
          Ketentuan Token
        </a>
      </p>

      {hiddenFileInputs}
    </div>
  );
}

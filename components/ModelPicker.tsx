"use client";

// ponytail: satu popup model dipakai chat/gambar/video — tampilkan biaya Token
// per model supaya user tahu potongannya sebelum submit.
import { ChevronDown, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogModel } from "@/lib/model-catalog";

export default function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  priceNote,
}: {
  models: CatalogModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Keterangan harga, mis. "per 1.000 token" — default "per generate". */
  priceNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = models.find((m) => m.id === value) ?? models[0];
  // Chat ditagih metered per 1.000 token; tampilkan "/1K" agar "10" tidak terbaca biaya tetap.
  const perThousand = Boolean(priceNote && /1\.000/i.test(priceNote));

  // ponytail: menu di-portal ke <body> — composer berada di dalam container
  // `overflow-hidden`, jadi menu absolute biasa terpotong/tertutup dashboard.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Batasi agar menu (maks 50vh) tidak melewati atas layar saat tombol dekat atas.
      const maxMenuH = Math.min(256, window.innerHeight * 0.5);
      const bottom = Math.min(window.innerHeight - r.top + 8, window.innerHeight - maxMenuH - 12);
      setPos({ bottom, left: r.left, width: r.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Model: ${current.label}, ${current.cost} Token`}
        className="flex h-9 max-w-[9rem] items-center gap-1.5 rounded-full border border-neutral-200 pl-3 pr-2 text-xs text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-[12rem] dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <span className="truncate">{current.label}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-neutral-400">
          <Zap size={9} />
          {current.cost}
          {perThousand && "/1K"}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-neutral-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ bottom: pos.bottom, left: pos.left, minWidth: Math.max(pos.width, 260) }}
            className="fixed z-[100] flex max-h-[min(16rem,50vh)] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-800"
          >
            <p className="shrink-0 px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              Pilih model
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto">
            {models.map((m, i) => (
              <button
                key={`${m.provider ?? "model"}-${m.id}-${i}`}
                type="button"
                role="menuitemradio"
                aria-checked={m.id === current.id}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                  m.id === current.id ? "bg-neutral-50 dark:bg-neutral-700/60" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-white">
                  {m.label}
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary dark:bg-neutral-700 dark:text-white">
                  <Zap size={10} />
                  {m.cost}
                  {perThousand && "/1K"}
                </span>
              </button>
            ))}
            </div>
            <p className="shrink-0 border-t border-neutral-100 px-3 py-1.5 text-[11px] leading-snug text-neutral-400 dark:border-neutral-700">
              {perThousand
                ? "Token per 1.000 token (prompt + jawaban), dibulatkan ke atas."
                : `Angka = Token terpotong ${priceNote ?? "per generate"}.`}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}

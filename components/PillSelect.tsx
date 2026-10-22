"use client";

// ponytail: dropdown kecil bergaya pill yang sama dengan ModelPicker, supaya
// Rasio/Pengaturan tidak jadi kotak sendiri-sendiri di composer.
import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function PillSelect({
  value,
  options,
  onChange,
  label,
  icon,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  /** aria-label, mis. "Rasio". */
  label: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ bottom: window.innerHeight - r.top + 8, left: r.left });
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 pl-3 pr-2 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {icon}
        <span className="truncate">{value}</span>
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
            style={{ bottom: pos.bottom, left: pos.left, minWidth: 120 }}
            className="fixed z-[100] overflow-hidden rounded-xl border border-neutral-200 bg-white py-1.5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-800"
          >
            {options.map((o) => (
              <button
                key={o}
                type="button"
                role="menuitemradio"
                aria-checked={o === value}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
                  o === value
                    ? "bg-neutral-50 font-medium text-neutral-900 dark:bg-neutral-700/60 dark:text-white"
                    : "text-neutral-700 dark:text-neutral-200"
                }`}
              >
                {o}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

export default function ThemeToggle() {
  const { t } = useT();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage bisa gagal di private mode — abaikan, ini cuma preferensi tampilan.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("theme.toggle")}
      className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

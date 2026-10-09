import { FileText, HelpCircle, PenLine, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  file: FileText,
  pen: PenLine,
  help: HelpCircle,
};

export default function SuggestionCard({
  icon,
  title,
  description,
}: {
  icon: keyof typeof ICONS;
  title: string;
  description: string;
}) {
  const Icon = ICONS[icon];

  return (
    <button
      type="button"
      className="flex h-full min-h-[118px] w-full flex-col items-start gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 p-2.5 text-left transition hover:border-primary/40 hover:bg-primary-soft/40 sm:gap-1.5 sm:p-4 lg:p-5 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary sm:h-7 sm:w-7 dark:bg-neutral-800">
        <Icon size={14} />
      </span>
      <span className="text-xs font-semibold text-neutral-900 sm:text-sm dark:text-white">
        {title}
      </span>
      <span className="line-clamp-4 text-[11px] leading-snug text-neutral-500 sm:line-clamp-3 sm:text-[13px] dark:text-neutral-400">
        {description}
      </span>
    </button>
  );
}

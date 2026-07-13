"use client";

import { useVautoSearch } from "@/context/VautoSearchContext";
import { cn } from "@/lib/cn";

const CATEGORIES = [
  { emoji: "🚗", label: "Automobiliai", query: "Automobiliai" },
  { emoji: "🏠", label: "Būstas", query: "Būstas" },
  { emoji: "💼", label: "Darbas", query: "ieškau darbo" },
  { emoji: "🔧", label: "Paslaugos", query: "Paslaugos" },
  { emoji: "👗", label: "Drabužiai", query: "Drabužiai" },
  { emoji: "📱", label: "Technika", query: "Telefonai ir technika" },
] as const;

export function HomeCategoriesBar({ className }: { className?: string }) {
  const { setSearchQuery } = useVautoSearch();

  return (
    <div className={cn("w-full", className)}>
      <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map(({ emoji, label, query }) => (
          <button
            key={label}
            type="button"
            onClick={() => setSearchQuery(query)}
            className="shrink-0 rounded-full border border-slate-200/80 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/50"
          >
            <span className="mr-1.5" aria-hidden>
              {emoji}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

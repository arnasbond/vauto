"use client";

import { Search } from "lucide-react";
import { LITHUANIA_HOT_KEYWORDS } from "@/lib/local-seo";
import { useVauto } from "@/context/VautoContext";

export function HotKeywordsGrid() {
  const { searchQuery, setSearchQuery } = useVauto();

  if (searchQuery.trim()) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[var(--vauto-text-heading)]">
        <Search className="h-4 w-4 text-[var(--vauto-primary)]" />
        Populiaru šiandien Lietuvoje
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LITHUANIA_HOT_KEYWORDS.map((kw) => (
          <button
            key={kw.query}
            type="button"
            onClick={() => setSearchQuery(kw.query)}
            className="rounded-xl border border-[var(--vauto-border-subtle)] bg-[var(--vauto-card-bg)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--vauto-body)] shadow-sm transition hover:border-[var(--vauto-primary)]/40 hover:bg-[var(--ds-brand-soft)]"
          >
            {kw.label}
          </button>
        ))}
      </div>
    </section>
  );
}

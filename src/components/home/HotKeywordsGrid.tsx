"use client";

import { Search } from "lucide-react";
import { LITHUANIA_HOT_KEYWORDS } from "@/lib/local-seo";
import { useVauto } from "@/context/VautoContext";

export function HotKeywordsGrid() {
  const { searchQuery, setSearchQuery } = useVauto();

  if (searchQuery.trim()) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[#111827]">
        <Search className="h-4 w-4 text-[var(--flux-teal)]" />
        Populiaru šiandien Lietuvoje
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LITHUANIA_HOT_KEYWORDS.map((kw) => (
          <button
            key={kw.query}
            type="button"
            onClick={() => setSearchQuery(kw.query)}
            className="rounded-xl border border-[#dde5ef] bg-white px-3 py-2.5 text-left text-xs font-semibold text-[#374151] shadow-sm transition hover:border-[#1167b1]/40 hover:bg-[#eef6ff]"
          >
            {kw.label}
          </button>
        ))}
      </div>
    </section>
  );
}

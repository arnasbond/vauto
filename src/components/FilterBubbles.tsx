"use client";

import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearchState } from "@/context/VautoSearchContext";
import { generateDynamicFilters } from "@/lib/scoring";

export function FilterBubbles() {
  const { searchQuery } = useVautoSearchState();
  const dynamicFilters = useMemo(
    () => generateDynamicFilters(searchQuery),
    [searchQuery]
  );
  const { activeFilterIds, toggleFilter } = useVauto();

  if (dynamicFilters.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold text-[var(--vauto-text-muted)]">
        AI siūlomi filtrai
      </p>
      <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
        {dynamicFilters.map((filter) => {
          const isActive = activeFilterIds.has(filter.id);
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => toggleFilter(filter.id)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-[var(--vauto-primary)] bg-[var(--ds-brand-soft)] text-[var(--vauto-primary)]"
                  : "border-[var(--vauto-border-input)] bg-[var(--vauto-card-bg)] text-[var(--vauto-body)] hover:bg-[var(--vauto-surface-muted)]"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

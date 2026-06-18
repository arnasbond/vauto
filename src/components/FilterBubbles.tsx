"use client";

import { useVauto } from "@/context/VautoContext";

export function FilterBubbles() {
  const { dynamicFilters, activeFilterIds, toggleFilter } = useVauto();

  if (dynamicFilters.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-[var(--vauto-text-muted)]">
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
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "bg-[var(--vauto-blue)] text-white shadow-md"
                  : "border border-white/10 bg-white/5 text-[var(--vauto-text-muted)] hover:bg-white/10"
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

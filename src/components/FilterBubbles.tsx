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
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                isActive
                  ? "vauto-flux-chip-on"
                  : "border-white/10 bg-white/[0.04] text-[#cbd5e1] hover:bg-white/[0.08]"
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

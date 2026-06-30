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
      <p className="mb-2 text-xs font-semibold text-[#6b7280]">
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
                  ? "border-[#1167b1] bg-[#eef6ff] text-[#1167b1]"
                  : "border-[#d7dde5] bg-white text-[#4b5563] hover:bg-[#f8fafc]"
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

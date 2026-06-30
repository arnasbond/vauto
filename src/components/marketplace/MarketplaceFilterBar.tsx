"use client";

import { LayoutGrid, List, Map, X } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  formatResultsLabel,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import { cn } from "@/lib/cn";
import { useUserBehavior } from "@/context/UserBehaviorContext";

/**
 * P7c-full — slim results toolbar. Category/attribute trees removed;
 * refinement flows through FlowAgentComposer + agent updateUIFilters.
 */
export function MarketplaceFilterBar({
  searchQuery,
  resultCount,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
}: {
  searchQuery: string;
  resultCount: number;
  filters: MarketplaceFilterState;
  onFiltersChange: (next: MarketplaceFilterState) => void;
  viewMode: MarketplaceViewMode;
  onViewModeChange: (mode: MarketplaceViewMode) => void;
}) {
  const { trackEvent } = useUserBehavior();
  const safeFilters = normalizeMarketplaceFilters(filters);

  const hasActiveFilters =
    safeFilters.category !== "all" ||
    Boolean(safeFilters.location) ||
    safeFilters.priceMin != null ||
    safeFilters.priceMax != null ||
    safeFilters.condition !== "all" ||
    Object.keys(safeFilters.categoryAttributes ?? {}).length > 0;

  const clearFilters = () => {
    onFiltersChange({ ...DEFAULT_MARKETPLACE_FILTERS });
    trackEvent("filter_change", { patch: { reset: true }, category: "all" });
  };

  return (
    <div className="marketplace-filter-bar sticky top-0 z-20 -mx-4 border-b px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="marketplace-filter-title truncate text-sm font-semibold">
            {formatResultsLabel(searchQuery, resultCount)}
          </p>
          <p className="text-[10px] text-[var(--vauto-text-muted)]">
            Patikslinkite žemiau per AI asistentą
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-[var(--vauto-text-muted)] transition hover:text-[var(--vauto-text-main)]"
              aria-label="Pašalinti filtrus"
            >
              <X className="h-3.5 w-3.5" />
              Išvalyti
            </button>
          )}
          <div className="marketplace-filter-view-toggle flex items-center gap-1 rounded-xl border p-0.5">
            {(
              [
                ["list", List, "Sąrašas"],
                ["grid", LayoutGrid, "Tinklelis"],
                ["map", Map, "Žemėlapis"],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={viewMode === mode}
                onClick={() => {
                  trackEvent("view_mode_change", { mode });
                  onViewModeChange(mode);
                }}
                className={cn(
                  "rounded-lg p-2 transition",
                  viewMode === mode
                    ? "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)]"
                    : "vauto-text-subtle hover:bg-[var(--vauto-surface-muted)]"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

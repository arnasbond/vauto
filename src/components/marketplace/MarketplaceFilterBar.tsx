"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, List, Map, SlidersHorizontal, X } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  MARKETPLACE_RADIUS_OPTIONS,
  MARKETPLACE_SORT_OPTIONS,
  formatResultsLabel,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceSortMode,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import { Button, IconButton, Input, Modal, Select } from "@/design-system";
import { cn } from "@/lib/cn";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { MOCK_CATEGORY_LABELS } from "@/data/mockListings";
import type { ListingCategory } from "@/lib/types";

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Visos kategorijos" },
  ...(Object.entries(MOCK_CATEGORY_LABELS) as [ListingCategory, string][]).map(
    ([value, label]) => ({ value, label })
  ),
];

function FilterFields({
  filters,
  onChange,
  idPrefix,
}: {
  filters: MarketplaceFilterState;
  onChange: (next: MarketplaceFilterState) => void;
  idPrefix: string;
}) {
  const patch = (partial: Partial<MarketplaceFilterState>) => {
    onChange(normalizeMarketplaceFilters({ ...filters, ...partial }));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        id={`${idPrefix}-category`}
        label="Kategorija"
        value={filters.category}
        options={CATEGORY_OPTIONS}
        onChange={(e) =>
          patch({
            category: e.target.value as MarketplaceFilterState["category"],
          })
        }
      />
      <Select
        id={`${idPrefix}-sort`}
        label="Rikiavimas"
        value={filters.sort}
        options={MARKETPLACE_SORT_OPTIONS.map((o) => ({
          value: o.id,
          label: o.label,
        }))}
        onChange={(e) => patch({ sort: e.target.value as MarketplaceSortMode })}
      />
      <Input
        id={`${idPrefix}-location`}
        label="Vietovė"
        placeholder="pvz. Vilnius"
        value={filters.location}
        onChange={(e) => patch({ location: e.target.value })}
      />
      <Select
        id={`${idPrefix}-radius`}
        label="Spindulys"
        value={filters.radiusKm == null ? "" : String(filters.radiusKm)}
        options={MARKETPLACE_RADIUS_OPTIONS.map((o) => ({
          value: o.km == null ? "" : String(o.km),
          label: o.label,
        }))}
        onChange={(e) => {
          const v = e.target.value;
          patch({
            radiusKm: v === "" ? null : (Number(v) as NonNullable<
              MarketplaceFilterState["radiusKm"]
            >),
          });
        }}
      />
      <Input
        id={`${idPrefix}-price-min`}
        label="Kaina nuo (€)"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="0"
        value={filters.priceMin ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          patch({ priceMin: raw === "" ? null : Number(raw) });
        }}
      />
      <Input
        id={`${idPrefix}-price-max`}
        label="Kaina iki (€)"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="—"
        value={filters.priceMax ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          patch({ priceMax: raw === "" ? null : Number(raw) });
        }}
      />
    </div>
  );
}

/**
 * Marketplace filter / results toolbar — DS form controls + mobile filter drawer.
 * Filter state still flows through VautoSearchContext (no algorithm changes).
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(safeFilters);

  const hasActiveFilters =
    safeFilters.category !== "all" ||
    Boolean(safeFilters.location) ||
    safeFilters.priceMin != null ||
    safeFilters.priceMax != null ||
    safeFilters.condition !== "all" ||
    safeFilters.sort !== "relevance" ||
    safeFilters.radiusKm != null ||
    Object.keys(safeFilters.categoryAttributes ?? {}).length > 0;

  const clearFilters = useCallback(() => {
    onFiltersChange({ ...DEFAULT_MARKETPLACE_FILTERS });
    setDraft({ ...DEFAULT_MARKETPLACE_FILTERS });
    trackEvent("filter_change", { patch: { reset: true }, category: "all" });
  }, [onFiltersChange, trackEvent]);

  const openDrawer = () => {
    setDraft(safeFilters);
    setDrawerOpen(true);
  };

  const applyDrawer = () => {
    onFiltersChange(normalizeMarketplaceFilters(draft));
    trackEvent("filter_change", {
      patch: { drawer: true },
      category: draft.category,
    });
    setDrawerOpen(false);
  };

  return (
    <div
      data-marketplace-filter-bar
      className="marketplace-filter-bar sticky top-0 z-20 -mx-4 border-b border-[var(--ds-border-subtle)] bg-[color-mix(in_srgb,var(--ds-surface-card)_88%,transparent)] px-4 py-3 backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ds-text-primary)]">
            {formatResultsLabel(searchQuery, resultCount)}
          </p>
          <p className="text-[10px] text-[var(--ds-text-muted)]">
            Filtrai · AI patikslinimas žemiau
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            onClick={openDrawer}
            className="md:hidden"
            aria-label="Atidaryti filtrus"
          >
            Filtrai
            {hasActiveFilters ? (
              <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ds-brand)]" />
            ) : null}
          </Button>

          {hasActiveFilters ? (
            <IconButton
              label="Pašalinti filtrus"
              tone="muted"
              size="sm"
              onClick={clearFilters}
            >
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}

          <div className="flex items-center gap-0.5 rounded-[var(--ds-radius-control)] border border-[var(--ds-border-subtle)] p-0.5">
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
                  "rounded-[var(--ds-radius-sm)] p-2 transition-colors duration-[160ms]",
                  viewMode === mode
                    ? "bg-[var(--ds-brand)] text-[var(--ds-brand-contrast)]"
                    : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop inline filters */}
      <div className="mt-3 hidden md:block">
        <FilterFields
          idPrefix="desktop-filter"
          filters={safeFilters}
          onChange={(next) => {
            onFiltersChange(next);
            trackEvent("filter_change", {
              patch: { inline: true },
              category: next.category,
            });
          }}
        />
      </div>

      <Modal
        open={drawerOpen}
        title="Filtrai"
        onClose={() => setDrawerOpen(false)}
        className="max-h-[min(90dvh,40rem)] overflow-y-auto sm:max-w-lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Išvalyti
            </Button>
            <Button variant="primary" size="sm" onClick={applyDrawer}>
              Taikyti
            </Button>
          </>
        }
      >
        <FilterFields
          idPrefix="drawer-filter"
          filters={draft}
          onChange={setDraft}
        />
      </Modal>
    </div>
  );
}

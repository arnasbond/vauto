"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, List, Map, SlidersHorizontal, X } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  MARKETPLACE_RADIUS_OPTIONS,
  MARKETPLACE_SORT_OPTIONS,
  effectiveViewMode,
  formatResultsLabel,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceSortMode,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import { enabledViewModesForVertical } from "@/lib/vertical-presentation-contract";
import { Button, IconButton, Input, Modal, Select } from "@/design-system";
import { cn } from "@/lib/cn";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { visibleCategoryOptions } from "@vauto/shared/category-registry";
import { FacetFilterPanel } from "@/components/marketplace/FacetFilterPanel";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import {
  categoryForVerticalId,
  syncMarketplaceFiltersToUrl,
  transitionMarketplaceFiltersToVertical,
} from "@/lib/marketplace-filter-url";
import {
  activeFacetCount,
  serializeFacetSearchParams,
} from "@vauto/shared/marketplace-domain";

/** F7: exactly the 8 visible top-level categories (legacy slugs fold in). */
const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Visos kategorijos" },
  ...visibleCategoryOptions().map(({ id, label }) => ({ value: id, label })),
];

function FilterFields({
  filters,
  onChange,
  idPrefix,
  hideCategoryAndSort = false,
}: {
  filters: MarketplaceFilterState;
  onChange: (next: MarketplaceFilterState) => void;
  idPrefix: string;
  hideCategoryAndSort?: boolean;
}) {
  const patch = (partial: Partial<MarketplaceFilterState>) => {
    onChange(normalizeMarketplaceFilters({ ...filters, ...partial }));
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {!hideCategoryAndSort ? (
        <>
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
        </>
      ) : null}
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
  viewModeExplicit,
  onViewModeChange,
  surface = "auto",
}: {
  searchQuery: string;
  resultCount: number;
  filters: MarketplaceFilterState;
  onFiltersChange: (next: MarketplaceFilterState) => void;
  viewMode: MarketplaceViewMode;
  viewModeExplicit?: boolean;
  onViewModeChange: (mode: MarketplaceViewMode) => void;
  surface?: "auto" | "mobile" | "desktop";
}) {
  const { trackEvent } = useUserBehavior();
  const safeFilters = normalizeMarketplaceFilters(filters);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(safeFilters);
  const { query, setQuery, setVertical, clearFacets } = useCanonicalFacetQuery();
  const [draftQuery, setDraftQuery] = useState(query);
  const facetCount = activeFacetCount(query);

  // Stage 22A.1-A — the toolbar highlights the EFFECTIVE view (responsive
  // automatic default included), while explicit user selections are preserved.
  const isMobile = useIsMobile();
  const activeViewMode = effectiveViewMode(
    viewMode,
    viewModeExplicit ?? false,
    isMobile
  );

  const hasActiveFilters =
    safeFilters.category !== "all" ||
    Boolean(safeFilters.location) ||
    safeFilters.priceMin != null ||
    safeFilters.priceMax != null ||
    safeFilters.condition !== "all" ||
    safeFilters.sort !== "relevance" ||
    safeFilters.radiusKm != null ||
    Object.keys(safeFilters.categoryAttributes ?? {}).length > 0 ||
    facetCount > 0;

  const clearFilters = useCallback(() => {
    clearFacets();
    setDraft({
      ...DEFAULT_MARKETPLACE_FILTERS,
      category: safeFilters.category,
    });
    trackEvent("filter_change", { patch: { reset: true }, category: safeFilters.category });
  }, [clearFacets, safeFilters.category, trackEvent]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    document
      .querySelector<HTMLButtonElement>("[data-facet-drawer-trigger]")
      ?.focus();
  };

  const openDrawer = () => {
    setDraft(safeFilters);
    setDraftQuery(query);
    setDrawerOpen(true);
  };

  const applyDrawer = () => {
    // Stage 22C — the drawer's chosen vertical drives ONE deterministic
    // transition: prune canonical predicates + category attributes + location
    // against the target vertical's canonical schema, preserving global state
    // (price/condition/radius/query). The drawer's canonical edits live in
    // `draftQuery`, so they are serialized into the facetQueryString the
    // transition parses — never a stale pre-drawer string. `setQuery` commits
    // the pruned canonical query (the URL becomes canonical), and the SAME
    // transitioned state is committed to the filter store — no one-write-lag
    // between URL and state.
    const targetVerticalId = draftQuery.verticalId;
    const drawerQuery = { ...draftQuery, q: searchQuery, page: 1 };
    const merged = {
      ...draft,
      facetQueryString: serializeFacetSearchParams(drawerQuery).toString(),
    };
    const transitioned = transitionMarketplaceFiltersToVertical(merged, {
      verticalId: targetVerticalId,
      category: categoryForVerticalId(targetVerticalId, draft.category),
    });
    setQuery(drawerQuery);
    onFiltersChange(transitioned);
    // Stage 18.3 — persist the classic drawer's complementary facets (location,
    // price, condition, radius, category attrs) into the same search URL so
    // they survive reload/deep-link and stay in sync with AI chips.
    syncMarketplaceFiltersToUrl(transitioned);
    trackEvent("filter_change", {
      patch: { drawer: true },
      category: transitioned.category,
    });
    closeDrawer();
  };

  const showMobileDrawer = surface !== "desktop";
  const showDesktopPanel = surface !== "mobile";

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
          {showMobileDrawer ? (
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            onClick={openDrawer}
            className={surface === "mobile" ? undefined : "md:hidden"}
            aria-label="Atidaryti filtrus"
            aria-expanded={drawerOpen}
            data-facet-drawer-trigger
          >
            Filtrai
            {facetCount > 0 ? (
              <span className="ml-1 text-[11px]" data-facet-active-count>
                {facetCount}
              </span>
            ) : hasActiveFilters ? (
              <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ds-brand)]" />
            ) : null}
          </Button>
          ) : null}

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
            {enabledViewModesForVertical(query.verticalId).map(({ mode, enabled, mapLevel }) => {
              const Icon = mode === "list" ? List : mode === "grid" ? LayoutGrid : Map;
              const label = mode === "list" ? "Sąrašas" : mode === "grid" ? "Tinklelis" : "Žemėlapis";
              const isActive = activeViewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  title={mapLevel ? `${label} (${mapLevel})` : label}
                  aria-label={mapLevel ? `${label} (${mapLevel})` : label}
                  aria-pressed={isActive}
                  aria-disabled={!enabled}
                  disabled={!enabled}
                  data-view-mode={mode}
                  data-view-mode-enabled={enabled}
                  onClick={() => {
                    if (!enabled) return;
                    trackEvent("view_mode_change", { mode });
                    onViewModeChange(mode);
                  }}
                  className={cn(
                    "rounded-[var(--ds-radius-sm)] p-2 transition-colors duration-[160ms]",
                    !enabled && "cursor-not-allowed opacity-35",
                    isActive && enabled
                      ? "bg-[var(--ds-brand)] text-[var(--ds-brand-contrast)]"
                      : "text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-muted)] hover:text-[var(--ds-text-primary)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop inline filters */}
      {showDesktopPanel ? (
      <div className={surface === "desktop" ? "mt-3" : "mt-3 hidden md:block"} data-facet-desktop>
        <FacetFilterPanel
          query={query}
          onChange={setQuery}
          onVerticalChange={setVertical}
          idPrefix="desktop-facet"
        />
        <div className="mt-3">
          <FilterFields
            idPrefix="desktop-filter"
            hideCategoryAndSort
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
      </div>
      ) : null}

      {showMobileDrawer ? (
      <Modal
        open={drawerOpen}
        title="Filtrai"
        onClose={closeDrawer}
        className="max-h-[min(90dvh,40rem)] overflow-y-auto overflow-x-hidden sm:max-w-lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Išvalyti filtrus
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={applyDrawer}
              data-facet-apply
            >
              Taikyti filtrus
            </Button>
          </>
        }
      >
        <div data-facet-drawer>
          <FacetFilterPanel
            query={draftQuery}
            onChange={setDraftQuery}
            onVerticalChange={(id) =>
              setDraftQuery({
                ...draftQuery,
                verticalId: id,
                predicates: [],
                page: 1,
              })
            }
            idPrefix="drawer-facet"
          />
          <div className="mt-3">
            <FilterFields
              idPrefix="drawer-filter"
              hideCategoryAndSort
              filters={draft}
              onChange={setDraft}
            />
          </div>
        </div>
      </Modal>
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LayoutGrid, List, Map, SlidersHorizontal, X } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  effectiveChameleonCategory,
  formatResultsLabel,
  MARKETPLACE_RADIUS_OPTIONS,
  MARKETPLACE_SORT_OPTIONS,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import { LT_CITY_NAMES } from "@/lib/lt-cities";
import type { ListingCategory } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { CategoryAttributeFilterPanel } from "@/components/marketplace/CategoryAttributeFilterPanel";
import {
  categoryFilterFieldsFor,
  countActiveCategoryFilters,
} from "@/lib/category-attribute-filters";

const CATEGORIES: { id: ListingCategory | "all"; label: string }[] = [
  { id: "all", label: "Visos" },
  { id: "vehicles", label: "Auto" },
  { id: "real_estate", label: "NT" },
  { id: "jobs", label: "Darbas" },
  { id: "clothing", label: "Drabužiai" },
  { id: "electronics", label: "Elektronika" },
  { id: "home", label: "Baldai" },
  { id: "services", label: "Paslaugos" },
  { id: "other", label: "Kita" },
];

const LOCATIONS = ["", ...LT_CITY_NAMES];

function measureDropdownPosition(btn: HTMLButtonElement) {
  const rect = btn.getBoundingClientRect();
  const minWidth = Math.max(rect.width, 188);
  const margin = 8;
  let left = rect.left;
  left = Math.max(margin, Math.min(left, window.innerWidth - minWidth - margin));
  let top = rect.bottom + 6;
  const maxTop = window.innerHeight - margin - 220;
  if (top > maxTop) {
    top = Math.max(margin, rect.top - 220);
  }
  return { top, left, minWidth };
}

function FilterDropdown({
  label,
  valueLabel,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 188 });

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    setPos(measureDropdownPosition(btnRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "marketplace-filter-chip inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
          open && "is-active"
        )}
      >
        <span className="marketplace-filter-chip-label text-[10px] font-bold uppercase tracking-wide">
          {label}
        </span>
        <span className="marketplace-filter-chip-value">{valueLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[9998] cursor-default border-0 bg-black/10 p-0"
              aria-label="Uždaryti meniu"
              onClick={onClose}
            />
            <div
              ref={panelRef}
              role="menu"
              className="marketplace-filter-menu fixed z-[9999] max-h-[min(70dvh,320px)] overflow-y-auto rounded-xl border p-2 shadow-2xl"
              style={{
                top: pos.top,
                left: pos.left,
                minWidth: pos.minWidth,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

const MENU_ITEM_CLASS =
  "marketplace-filter-menu-item block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium";

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
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [chameleonOpen, setChameleonOpen] = useState(false);
  const { trackEvent } = useUserBehavior();
  const safeFilters = normalizeMarketplaceFilters(filters);

  const chameleonCategory = effectiveChameleonCategory(safeFilters.category, searchQuery);
  const chameleonFieldCount = categoryFilterFieldsFor(chameleonCategory).length;
  const chameleonActiveCount = countActiveCategoryFilters(safeFilters.categoryAttributes);
  const hasChameleonFilters = chameleonFieldCount > 0;

  const toggle = (key: string) => {
    setChameleonOpen(false);
    setOpenKey((prev) => (prev === key ? null : key));
  };
  const close = () => setOpenKey(null);

  const patchFilters = (patch: Partial<MarketplaceFilterState>) => {
    const next = normalizeMarketplaceFilters({ ...safeFilters, ...patch });
    onFiltersChange(next);
    trackEvent("filter_change", { patch, category: next.category, location: next.location });
  };

  const handleChameleonChange = (categoryAttributes: MarketplaceFilterState["categoryAttributes"]) => {
    const patch: Partial<MarketplaceFilterState> = { categoryAttributes };
    if (safeFilters.category === "all" && chameleonCategory !== "all") {
      patch.category = chameleonCategory;
    }
    patchFilters(patch);
    setChameleonOpen(false);
  };

  const toggleChameleon = () => {
    setOpenKey(null);
    setChameleonOpen((prev) => !prev);
  };

  useEffect(() => {
    setChameleonOpen(false);
  }, [searchQuery, safeFilters.category]);

  const categoryLabel =
    CATEGORIES.find((c) => c.id === safeFilters.category)?.label ?? "Visos";
  const locationLabel = safeFilters.location || "Visur";
  const priceLabel =
    safeFilters.priceMin != null || safeFilters.priceMax != null
      ? `${safeFilters.priceMin ?? 0}–${safeFilters.priceMax ?? "∞"}€`
      : "Bet kokia";
  const conditionLabel =
    safeFilters.condition === "all"
      ? "Visos"
      : safeFilters.condition === "new"
        ? "Naujos"
        : "Naudotos";
  const sortLabel =
    MARKETPLACE_SORT_OPTIONS.find((o) => o.id === safeFilters.sort)?.label ??
    "Rūšiuoti";
  const radiusLabel =
    MARKETPLACE_RADIUS_OPTIONS.find((o) => o.km === safeFilters.radiusKm)
      ?.label ?? "Visa Lietuva";

  return (
    <div className="marketplace-filter-bar sticky top-0 z-20 -mx-4 border-b px-4 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="marketplace-filter-title min-w-0 truncate text-sm font-semibold">
          {formatResultsLabel(searchQuery, resultCount)}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasChameleonFilters && (
            <button
              type="button"
              onClick={toggleChameleon}
              aria-expanded={chameleonOpen}
              className={cn(
                "marketplace-filter-chip inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition",
                (chameleonOpen || chameleonActiveCount > 0) && "is-active"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filtrai</span>
              {chameleonActiveCount > 0 && (
                <span className="rounded-full bg-[#1167b1] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {chameleonActiveCount}
                </span>
              )}
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

      <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-0.5 scrollbar-hide">
        <FilterDropdown
          label="Rūšiuoti"
          valueLabel={sortLabel}
          open={openKey === "sort"}
          onToggle={() => toggle("sort")}
          onClose={close}
        >
          {MARKETPLACE_SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className={cn(
                MENU_ITEM_CLASS,
                safeFilters.sort === option.id && "bg-[#eef6ff] font-semibold text-[#1167b1]"
              )}
              onClick={() => {
                patchFilters({ sort: option.id });
                close();
              }}
            >
              {option.label}
            </button>
          ))}
        </FilterDropdown>

        <FilterDropdown
          label="Kategorija"
          valueLabel={categoryLabel}
          open={openKey === "category"}
          onToggle={() => toggle("category")}
          onClose={close}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              className={cn(
                MENU_ITEM_CLASS,
                safeFilters.category === c.id && "bg-[#eef6ff] font-semibold text-[#1167b1]"
              )}
              onClick={() => {
                patchFilters({ category: c.id, categoryAttributes: {} });
                close();
              }}
            >
              {c.label}
            </button>
          ))}
        </FilterDropdown>

        <FilterDropdown
          label="Lokacija"
          valueLabel={locationLabel}
          open={openKey === "location"}
          onToggle={() => toggle("location")}
          onClose={close}
        >
          {LOCATIONS.map((loc) => (
            <button
              key={loc || "all"}
              type="button"
              role="menuitem"
              className={cn(
                MENU_ITEM_CLASS,
                safeFilters.location === loc && "bg-[#eef6ff] font-semibold text-[#1167b1]"
              )}
              onClick={() => {
                patchFilters({ location: loc });
                close();
              }}
            >
              {loc || "Visur"}
            </button>
          ))}
        </FilterDropdown>

        <FilterDropdown
          label="Atstumas"
          valueLabel={radiusLabel}
          open={openKey === "radius"}
          onToggle={() => toggle("radius")}
          onClose={close}
        >
          {MARKETPLACE_RADIUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              className={cn(
                MENU_ITEM_CLASS,
                safeFilters.radiusKm === option.km &&
                  "bg-[#eef6ff] font-semibold text-[#1167b1]"
              )}
              onClick={() => {
                patchFilters({ radiusKm: option.km });
                close();
              }}
            >
              {option.label}
            </button>
          ))}
        </FilterDropdown>

        <FilterDropdown
          label="Kaina"
          valueLabel={priceLabel}
          open={openKey === "price"}
          onToggle={() => toggle("price")}
          onClose={close}
        >
          <div className="marketplace-filter-menu space-y-2 p-1">
            <label className="vauto-text-subtle block text-xs font-semibold">Nuo €</label>
            <input
              type="number"
              min={0}
              value={safeFilters.priceMin ?? ""}
              onChange={(e) =>
                patchFilters({
                  priceMin: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="marketplace-filter-input w-full rounded-lg border border-[#dde5ef] px-2 py-2 text-sm"
            />
            <label className="vauto-text-subtle block text-xs font-semibold">Iki €</label>
            <input
              type="number"
              min={0}
              value={safeFilters.priceMax ?? ""}
              onChange={(e) =>
                patchFilters({
                  priceMax: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="marketplace-filter-input w-full rounded-lg border border-[#dde5ef] px-2 py-2 text-sm"
            />
            <button
              type="button"
              className="mt-1 w-full rounded-lg bg-[#1167b1] py-2 text-xs font-semibold text-white"
              onClick={close}
            >
              Taikyti
            </button>
          </div>
        </FilterDropdown>

        <FilterDropdown
          label="Būklė"
          valueLabel={conditionLabel}
          open={openKey === "condition"}
          onToggle={() => toggle("condition")}
          onClose={close}
        >
          {(
            [
              ["all", "Visos"],
              ["new", "Naujos"],
              ["used", "Naudotos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={cn(
                MENU_ITEM_CLASS,
                safeFilters.condition === id && "bg-[#eef6ff] font-semibold text-[#1167b1]"
              )}
              onClick={() => {
                patchFilters({ condition: id });
                close();
              }}
            >
              {label}
            </button>
          ))}
        </FilterDropdown>

        {(safeFilters.category !== "all" ||
          safeFilters.location ||
          safeFilters.radiusKm != null ||
          safeFilters.priceMin != null ||
          safeFilters.priceMax != null ||
          safeFilters.condition !== "all" ||
          safeFilters.sort !== "relevance" ||
          countActiveCategoryFilters(safeFilters.categoryAttributes) > 0) && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...DEFAULT_MARKETPLACE_FILTERS })}
            className="marketplace-filter-chip shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--vauto-primary)]"
          >
            Išvalyti
          </button>
        )}
      </div>

      {/* Desktop: expandable panel */}
      {hasChameleonFilters && chameleonOpen && (
        <div className="marketplace-filter-panel mt-2 hidden max-h-[min(40vh,280px)] overflow-y-auto rounded-2xl border p-2 shadow-sm md:block">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="vauto-text-body text-xs font-semibold">Chameleon filtrai</p>
            <button
              type="button"
              onClick={() => setChameleonOpen(false)}
              className="vauto-text-subtle rounded-lg p-1 hover:bg-[var(--vauto-surface-muted)]"
              aria-label="Suskleisti filtrus"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CategoryAttributeFilterPanel
            category={chameleonCategory}
            filters={safeFilters.categoryAttributes}
            onChange={handleChameleonChange}
            showTitle={false}
          />
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {hasChameleonFilters &&
        chameleonOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="md:hidden">
            <button
              type="button"
              className="fixed inset-0 z-[9998] border-0 bg-black/40 p-0"
              aria-label="Uždaryti filtrus"
              onClick={() => setChameleonOpen(false)}
            />
            <div
              className="marketplace-filter-panel fixed inset-x-0 bottom-0 z-[9999] max-h-[min(75dvh,520px)] overflow-hidden rounded-t-3xl border shadow-2xl transition-transform duration-200 ease-out"
              role="dialog"
              aria-label="Chameleon filtrai"
            >
              <div className="flex items-center justify-between border-b border-[var(--vauto-border)] px-4 py-3">
                <p className="vauto-text-heading text-sm font-bold">Chameleon filtrai</p>
                <button
                  type="button"
                  onClick={() => setChameleonOpen(false)}
                  className="vauto-text-subtle rounded-full p-2 hover:bg-[var(--vauto-surface-muted)]"
                  aria-label="Uždaryti"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <CategoryAttributeFilterPanel
                  category={chameleonCategory}
                  filters={safeFilters.categoryAttributes}
                  onChange={handleChameleonChange}
                  showTitle={false}
                />
                {chameleonActiveCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleChameleonChange({})}
                    className="mt-3 w-full rounded-xl border border-[var(--vauto-border)] py-2.5 text-sm font-semibold text-[var(--vauto-primary)]"
                  >
                    Išvalyti filtrus ({chameleonActiveCount})
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LayoutGrid, List, Map } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  formatResultsLabel,
  MARKETPLACE_SORT_OPTIONS,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import type { ListingCategory } from "@/lib/types";
import { cn } from "@/lib/cn";

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

const LOCATIONS = [
  "",
  "Vilnius",
  "Kaunas",
  "Klaipėda",
  "Šiauliai",
  "Panevėžys",
  "Alytus",
  "Palanga",
];

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
          "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
          open
            ? "border-[#1167b1] bg-[#1167b1]/10 text-[#1167b1]"
            : "border-[#dde5ef] bg-white text-[#374151] hover:border-[#1167b1]/40"
        )}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">
          {label}
        </span>
        <span className="text-[#111827]">{valueLabel}</span>
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
              className="fixed z-[9999] max-h-[min(70dvh,320px)] overflow-y-auto rounded-xl border border-[#dde5ef] bg-white p-2 text-[#111827] shadow-2xl"
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
  "block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#111827] hover:bg-[#f1f5f9] active:bg-[#e8ecf3]";

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
  const safeFilters = normalizeMarketplaceFilters(filters);

  const toggle = (key: string) =>
    setOpenKey((prev) => (prev === key ? null : key));
  const close = () => setOpenKey(null);

  const patchFilters = (patch: Partial<MarketplaceFilterState>) => {
    onFiltersChange(normalizeMarketplaceFilters({ ...safeFilters, ...patch }));
  };

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

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-[#e8ecf3] bg-[#f8fafc]/95 px-4 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">
          {formatResultsLabel(searchQuery, resultCount)}
        </p>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#dde5ef] bg-white p-0.5">
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
              onClick={() => onViewModeChange(mode)}
              className={cn(
                "rounded-lg p-2 transition",
                viewMode === mode
                  ? "bg-[#1167b1] text-white"
                  : "text-[#6b7280] hover:bg-[#f1f5f9]"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
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
                patchFilters({ category: c.id });
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
          label="Kaina"
          valueLabel={priceLabel}
          open={openKey === "price"}
          onToggle={() => toggle("price")}
          onClose={close}
        >
          <div className="space-y-2 p-1 text-[#111827]">
            <label className="block text-xs font-semibold text-[#6b7280]">Nuo €</label>
            <input
              type="number"
              min={0}
              value={safeFilters.priceMin ?? ""}
              onChange={(e) =>
                patchFilters({
                  priceMin: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-[#dde5ef] px-2 py-2 text-sm text-[#111827]"
            />
            <label className="block text-xs font-semibold text-[#6b7280]">Iki €</label>
            <input
              type="number"
              min={0}
              value={safeFilters.priceMax ?? ""}
              onChange={(e) =>
                patchFilters({
                  priceMax: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-[#dde5ef] px-2 py-2 text-sm text-[#111827]"
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
          safeFilters.priceMin != null ||
          safeFilters.priceMax != null ||
          safeFilters.condition !== "all" ||
          safeFilters.sort !== "relevance") && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...DEFAULT_MARKETPLACE_FILTERS })}
            className="shrink-0 rounded-full border border-[#dde5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#1167b1]"
          >
            Išvalyti
          </button>
        )}
      </div>
    </div>
  );
}

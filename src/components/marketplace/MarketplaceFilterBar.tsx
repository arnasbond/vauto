"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, LayoutGrid, List, Map } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  formatResultsLabel,
  MARKETPLACE_SORT_OPTIONS,
  type MarketplaceFilterState,
  type MarketplaceSortMode,
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
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 160 });

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const update = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: rect.left,
        minWidth: Math.max(rect.width, 160),
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose]);

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
        <span>{valueLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className="rounded-xl border border-[#dde5ef] bg-white p-2 shadow-xl"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: pos.minWidth,
              zIndex: 9999,
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

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

  const toggle = (key: string) =>
    setOpenKey((prev) => (prev === key ? null : key));
  const close = () => setOpenKey(null);

  const categoryLabel =
    CATEGORIES.find((c) => c.id === filters.category)?.label ?? "Visos";
  const locationLabel = filters.location || "Visur";
  const priceLabel =
    filters.priceMin != null || filters.priceMax != null
      ? `${filters.priceMin ?? 0}–${filters.priceMax ?? "∞"}€`
      : "Bet kokia";
  const conditionLabel =
    filters.condition === "all"
      ? "Visos"
      : filters.condition === "new"
        ? "Naujos"
        : "Naudotos";
  const sortLabel =
    MARKETPLACE_SORT_OPTIONS.find((o) => o.id === filters.sort)?.label ??
    "Rūšiuoti";

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-[#e8ecf3] bg-[#f8fafc]/95 px-4 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">
          {formatResultsLabel(searchQuery, resultCount)}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <FilterDropdown
            label="Rūšiuoti"
            valueLabel={sortLabel}
            open={openKey === "sort"}
            onToggle={() => toggle("sort")}
            onClose={close}
          >
            {MARKETPLACE_SORT_OPTIONS.filter((o) => o.id !== "relevance").map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]",
                    filters.sort === option.id && "font-semibold text-[#1167b1]"
                  )}
                  onClick={() => {
                    onFiltersChange({
                      ...filters,
                      sort: option.id as MarketplaceSortMode,
                    });
                    close();
                  }}
                >
                  {option.label}
                </button>
              )
            )}
          </FilterDropdown>

          <div className="flex items-center gap-1 rounded-xl border border-[#dde5ef] bg-white p-0.5">
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
      </div>

      <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-0.5 scrollbar-hide">
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
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, category: c.id });
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
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, location: loc });
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
          <div className="space-y-2 p-1">
            <label className="block text-[10px] font-semibold text-[#6b7280]">Nuo €</label>
            <input
              type="number"
              min={0}
              value={filters.priceMin ?? ""}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  priceMin: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-[#dde5ef] px-2 py-1.5 text-xs"
            />
            <label className="block text-[10px] font-semibold text-[#6b7280]">Iki €</label>
            <input
              type="number"
              min={0}
              value={filters.priceMax ?? ""}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  priceMax: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-[#dde5ef] px-2 py-1.5 text-xs"
            />
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
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, condition: id });
                close();
              }}
            >
              {label}
            </button>
          ))}
        </FilterDropdown>

        {(filters.category !== "all" ||
          filters.location ||
          filters.priceMin != null ||
          filters.priceMax != null ||
          filters.condition !== "all") && (
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

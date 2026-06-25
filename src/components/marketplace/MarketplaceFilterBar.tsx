"use client";

import { useState } from "react";
import { ChevronDown, LayoutGrid, List, Map } from "lucide-react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  formatResultsLabel,
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

function FilterDropdown({
  label,
  valueLabel,
  open,
  onToggle,
  children,
}: {
  label: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
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
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-xl border border-[#dde5ef] bg-white p-2 shadow-lg">
          {children}
        </div>
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

  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

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

      <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
        <FilterDropdown
          label="Kategorija"
          valueLabel={categoryLabel}
          open={openKey === "category"}
          onToggle={() => toggle("category")}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, category: c.id });
                setOpenKey(null);
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
        >
          {LOCATIONS.map((loc) => (
            <button
              key={loc || "all"}
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, location: loc });
                setOpenKey(null);
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
              className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-[#f1f5f9]"
              onClick={() => {
                onFiltersChange({ ...filters, condition: id });
                setOpenKey(null);
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

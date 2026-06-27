"use client";

import { useState } from "react";
import {
  BriefcaseBusiness,
  Car,
  ChevronRight,
  Home,
  Laptop,
  Package,
  Shirt,
  Sofa,
  Wrench,
} from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  type MarketplaceFilterState,
} from "@/lib/marketplace-view";
import {
  MARKETPLACE_CATEGORY_TREE,
  type MarketplaceCategoryDef,
} from "@/lib/marketplace-subcategories";
import type { ListingCategory } from "@/lib/types";

const ICONS: Record<ListingCategory, typeof Car> = {
  vehicles: Car,
  electronics: Laptop,
  home: Sofa,
  clothing: Shirt,
  services: Wrench,
  real_estate: Home,
  jobs: BriefcaseBusiness,
  other: Package,
};

export function MarketplaceCategoryGrid() {
  const {
    isAuthenticated,
    user,
    setSearchQuery,
    setMarketplaceFilters,
    setAgentPinnedListings,
  } = useVauto();
  const [expandedId, setExpandedId] = useState<ListingCategory | null>(null);

  const applyBrowse = (
    category: ListingCategory,
    query: string,
    patch?: Partial<MarketplaceFilterState>
  ) => {
    setAgentPinnedListings(null);
    setMarketplaceFilters({
      ...DEFAULT_MARKETPLACE_FILTERS,
      category,
      sort: "newest",
      ...patch,
    });
    setSearchQuery(query);
    requestAnimationFrame(() => {
      document.getElementById("listing-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleCategoryClick = (cat: MarketplaceCategoryDef) => {
    const isGuest = !isAuthenticated || user.id === "guest";
    if (cat.id === "clothing" && isGuest) {
      window.location.href = "/fashion/";
      return;
    }
    setExpandedId((prev) => (prev === cat.id ? null : cat.id));
  };

  return (
    <section className="vauto-dashboard-card mb-6 rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--vauto-text-main)]">
          Kategorijos
        </h2>
        <span className="text-[11px] font-semibold text-[var(--vauto-primary)]">
          Pasirinkite subkategoriją
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MARKETPLACE_CATEGORY_TREE.map((cat) => {
          const Icon = ICONS[cat.id];
          const expanded = expandedId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat)}
              className={`group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition ${
                expanded
                  ? "bg-[color-mix(in_srgb,var(--vauto-primary)_14%,transparent)] ring-2 ring-[var(--vauto-primary)]"
                  : "hover:bg-[color-mix(in_srgb,var(--vauto-text-main)_6%,transparent)]"
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                  expanded
                    ? "bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast,#fff)]"
                    : "bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)] text-[var(--vauto-primary)]"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-semibold leading-tight text-[var(--vauto-text-main)]">
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {expandedId && (
        <div className="mt-3 rounded-xl border border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-text-main)_4%,transparent)] p-2">
          <p className="mb-2 px-1 text-[11px] font-semibold text-[var(--vauto-text-muted)]">
            {MARKETPLACE_CATEGORY_TREE.find((c) => c.id === expandedId)?.label}{" "}
            — subkategorijos
          </p>
          <div className="flex flex-col gap-1">
            {MARKETPLACE_CATEGORY_TREE.find((c) => c.id === expandedId)
              ?.subcategories.map((sub) => (
                <button
                  key={sub.label}
                  type="button"
                  onClick={() => applyBrowse(expandedId, sub.query)}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[var(--vauto-text-main)] transition hover:bg-[color-mix(in_srgb,var(--vauto-primary)_10%,transparent)]"
                >
                  {sub.label}
                  <ChevronRight className="h-4 w-4 text-[var(--vauto-text-muted)]" />
                </button>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

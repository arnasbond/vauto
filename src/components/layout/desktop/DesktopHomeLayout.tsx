"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, Sparkles, Tag } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { MarketplaceFilterBar } from "@/components/marketplace/MarketplaceFilterBar";
import { MARKETPLACE_VERTICALS } from "@/lib/marketplace-verticals";
import { useCanonicalFacetQuery } from "@/hooks/useCanonicalFacetUrl";
import { cn } from "@/lib/cn";

interface DesktopHomeLayoutProps {
  children: ReactNode;
  /** Optional hero / search strip above the grid */
  header?: ReactNode;
}

/**
 * Desktop marketplace scaffold — sidebar filters + wide content.
 * Reuses MarketplaceFilterBar and the same VautoSearchContext streams.
 */
export function DesktopHomeLayout({ children, header }: DesktopHomeLayoutProps) {
  const { rankedListings } = useVauto();
  const {
    searchQuery,
    marketplaceFilters,
    setMarketplaceFilters,
    viewMode,
    setViewMode,
  } = useVautoSearch();
  const { query, setVertical } = useCanonicalFacetQuery();

  return (
    <div className="flex gap-8">
      <aside
        className="hidden w-[var(--anonser-sidebar-width)] shrink-0 md:block"
        aria-label="Filtrai ir B2B"
        data-facet-desktop-sidebar
      >
        <div className="sticky top-[calc(var(--anonser-header-height)+1.5rem)] space-y-5">
          <section className="rounded-xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--anonser-text)]">
              <Tag className="h-4 w-4 text-[var(--anonser-primary)]" />
              Kategorijos
            </h2>
            <ul className="space-y-1">
              {MARKETPLACE_VERTICALS.map((vertical) => (
                <li key={vertical.id}>
                  <button
                    type="button"
                    data-vertical-id={vertical.id}
                    data-canonical-vertical={vertical.canonicalId}
                    onClick={() => setVertical(vertical.canonicalId)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                      query.verticalId === vertical.canonicalId
                        ? "bg-[var(--anonser-primary-soft)] font-medium text-[var(--anonser-primary)]"
                        : "text-[var(--anonser-text-muted)] hover:bg-[var(--anonser-surface-muted)]"
                    )}
                  >
                    {vertical.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--anonser-border)] bg-[var(--anonser-card)] p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-[var(--anonser-text)]">
              Išplėstiniai filtrai
            </h2>
            <MarketplaceFilterBar
              searchQuery={searchQuery}
              resultCount={rankedListings.length}
              filters={marketplaceFilters}
              onFiltersChange={setMarketplaceFilters}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              surface="desktop"
            />
          </section>

          <section className="rounded-xl border border-dashed border-[var(--anonser-primary)]/30 bg-[var(--anonser-primary-soft)] p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--anonser-primary)]">
              <Building2 className="h-4 w-4" />
              Verslui
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-[var(--anonser-text-muted)]">
              B2B skelbimai, lead&apos;ai ir verslo įžvalgos — VAUTO verslo
              kabinete.
            </p>
            <Link
              href="/verslui/"
              className="mb-2 block text-xs font-semibold text-[var(--anonser-primary)] hover:underline"
            >
              Atidaryti VAUTO verslo kabinetą →
            </Link>
            <Link
              href="/verslui/"
              className="text-xs text-[var(--anonser-text-muted)] hover:text-[var(--anonser-primary)]"
            >
              Verslui →
            </Link>
          </section>

          <section className="flex items-start gap-2 rounded-lg bg-[var(--anonser-surface-muted)] p-3 text-xs text-[var(--anonser-text-muted)]">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--anonser-accent)]" />
            <span>
              AI agentas ir paieška veikia identiškai kaip mobilioje versijoje —
              tie patys backend srautai.
            </span>
          </section>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {header}
        <div className="mt-4 md:mt-0">{children}</div>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import type { ScoredListing } from "@/lib/types";

const ListingMapViewInner = dynamic(
  () =>
    import("@/components/marketplace/ListingMapViewInner").then(
      (m) => m.ListingMapViewInner
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[min(70vh,520px)] items-center justify-center rounded-2xl border border-[var(--vauto-border-input)] bg-[var(--vauto-surface-page)] text-sm text-[var(--vauto-text-subtle)]">
        Kraunamas žemėlapis…
      </div>
    ),
  }
);

export function ListingMapView({ listings }: { listings: ScoredListing[] }) {
  return <ListingMapViewInner listings={listings} />;
}

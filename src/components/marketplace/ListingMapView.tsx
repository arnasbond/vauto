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
      <div className="flex h-[min(70vh,520px)] items-center justify-center rounded-2xl border border-[#dde5ef] bg-white text-sm text-[#6b7280]">
        Kraunamas žemėlapis…
      </div>
    ),
  }
);

export function ListingMapView({ listings }: { listings: ScoredListing[] }) {
  return <ListingMapViewInner listings={listings} />;
}

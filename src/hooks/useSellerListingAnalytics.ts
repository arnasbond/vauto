"use client";

import { useEffect, useState } from "react";
import { apiGetSellerListingAnalytics } from "@/lib/api/listing-events";
import type { ListingMetrics } from "@/lib/listing-analytics";
import {
  mergeSellerAnalytics,
  type SellerListingAnalytics,
} from "@/lib/seller-listing-analytics";

/**
 * Loads real listing_events aggregates for Pro dashboard when API is live.
 * Falls back to in-memory listing counters when offline / unauthorized.
 */
export function useSellerListingAnalytics(
  apiActive: boolean,
  local: ListingMetrics
): SellerListingAnalytics {
  const [remote, setRemote] = useState<SellerListingAnalytics | null>(null);

  useEffect(() => {
    if (!apiActive) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    void apiGetSellerListingAnalytics(30).then((data) => {
      if (!cancelled) setRemote(data);
    });
    return () => {
      cancelled = true;
    };
  }, [apiActive]);

  return mergeSellerAnalytics(local, remote);
}

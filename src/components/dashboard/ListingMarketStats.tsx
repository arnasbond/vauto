"use client";

import { Users } from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import {
  getMarketInsights,
  precisionLabel,
} from "@/lib/market-insights";
import type { Listing } from "@/lib/types";

interface ListingMarketStatsProps {
  listing: Listing;
  allListings: Listing[];
  buyerIntentCount?: number;
  compact?: boolean;
}

export function ListingMarketStats({
  listing,
  allListings,
  buyerIntentCount = 0,
  compact = false,
}: ListingMarketStatsProps) {
  const insights = getMarketInsights(listing, allListings, { buyerIntentCount });

  if (insights.competitorCount === 0 && insights.precision === "low") {
    return (
      <p className="mt-2 text-[10px] text-slate-500">
        Pridėkite daugiau detalių — parodysime konkurentų kainas ir skaičių.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        {insights.competitorCount > 0 && (
          <span className="flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-sky-300">
            <Users className="h-3 w-3" />
            {insights.competitorCount} konkurentai
          </span>
        )}
        {insights.priceAdvice.minPrice != null && insights.priceAdvice.maxPrice != null && (
          <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[var(--vauto-teal)]">
            {formatPrice(insights.priceAdvice.minPrice)}–
            {formatPrice(insights.priceAdvice.maxPrice)}
          </span>
        )}
        <span className="text-slate-500">{precisionLabel(insights.precision)}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white/[0.03] p-2.5">
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="font-medium text-sky-300">
          {insights.competitorCount} panašūs skelbimai
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">{insights.pricePositionLabel}</span>
      </div>
      {insights.priceAdvice.minPrice != null && insights.priceAdvice.maxPrice != null && (
        <p className="mt-1 text-[10px] text-[var(--vauto-teal)]">
          Kainos {insights.scopeLabel}: {formatPrice(insights.priceAdvice.minPrice)} –{" "}
          {formatPrice(insights.priceAdvice.maxPrice)}
          {insights.priceAdvice.medianPrice != null &&
            ` (vid. ${formatPrice(insights.priceAdvice.medianPrice)})`}
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-slate-500">
        {precisionLabel(insights.precision)} · {insights.predictedVisibilityLift}
      </p>
    </div>
  );
}

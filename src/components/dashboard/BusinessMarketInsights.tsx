"use client";

import {
  BarChart3,
  Lightbulb,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatPrice } from "@/data/mockListings";
import {
  getBusinessMarketOverview,
  precisionLabel,
  type BoostTip,
} from "@/lib/market-insights";
import { cn } from "@/lib/cn";
import type { Listing } from "@/lib/types";

interface BusinessMarketInsightsProps {
  listings: Listing[];
  allListings: Listing[];
  buyerIntentCount: number;
  onPromoteListing?: (listingId: string) => void;
}

function urgencyStyles(urgency: BoostTip["urgency"]) {
  switch (urgency) {
    case "high":
      return "border-[var(--ds-warning)]/40 bg-[var(--ds-warning-soft)]";
    case "medium":
      return "border-[var(--vauto-teal)]/30 bg-[var(--vauto-teal)]/10";
    default:
      return "border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)]";
  }
}

export function BusinessMarketInsights({
  listings,
  allListings,
  buyerIntentCount,
  onPromoteListing,
}: BusinessMarketInsightsProps) {
  const overview = getBusinessMarketOverview(
    listings,
    allListings,
    buyerIntentCount
  );

  if (overview.activeListings === 0) {
    return (
      <div className="vauto-dashboard-card mb-4 rounded-2xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--vauto-teal)]" />
          <h3 className="text-sm font-semibold text-[var(--vauto-text-heading)]">Rinkos statistika</h3>
        </div>
        <p className="text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          Pridėkite skelbimą — parodysime konkurentų skaičių, kainų diapazoną ir
          pasiūlymus, kaip iškelti ar paryškinti skelbimą.
        </p>
      </div>
    );
  }

  return (
    <div className="vauto-dashboard-card mb-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-[var(--vauto-text-heading)]">Rinkos statistika</h3>
        <span className="ml-auto rounded-full bg-[var(--vauto-surface-muted)] px-2 py-0.5 text-[10px] text-[var(--vauto-text-muted)]">
          {precisionLabel(overview.avgPrecision)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--vauto-surface-muted)] p-2.5 text-center">
          <Users className="mx-auto mb-1 h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
          <p className="text-base font-bold text-[var(--vauto-text-heading)]">{overview.totalCompetitors}</p>
          <p className="text-[9px] text-[var(--vauto-text-muted)]">Konkurentų skelbimų</p>
        </div>
        <div className="rounded-xl bg-[var(--vauto-surface-muted)] p-2.5 text-center">
          <Target className="mx-auto mb-1 h-3.5 w-3.5 text-[var(--vauto-teal)]" />
          <p className="text-base font-bold text-[var(--vauto-text-heading)]">
            {overview.listingsWithData}/{overview.activeListings}
          </p>
          <p className="text-[9px] text-[var(--vauto-text-muted)]">Su rinkos duomenimis</p>
        </div>
        <div className="rounded-xl bg-[var(--vauto-surface-muted)] p-2.5 text-center">
          <TrendingUp className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs font-bold leading-tight text-[var(--vauto-text-heading)]">
            {overview.priceRange.min != null && overview.priceRange.max != null
              ? `${formatPrice(overview.priceRange.min)}–${formatPrice(overview.priceRange.max)}`
              : "—"}
          </p>
          <p className="text-[9px] text-[var(--vauto-text-muted)]">Kainų diapazonas</p>
        </div>
      </div>

      {overview.listingInsights.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Pagal skelbimą
          </p>
          {overview.listingInsights.map(({ listingId, title, insights }) => (
            <div
              key={listingId}
              className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface-muted)] p-3"
            >
              <p className="truncate text-xs font-medium text-[var(--vauto-text-heading)]">{title}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-[var(--vauto-text-muted)]">
                <span>{insights.competitorCount} konkurentai</span>
                <span>·</span>
                <span>{insights.pricePositionLabel}</span>
                <span>·</span>
                <span>{precisionLabel(insights.precision)}</span>
              </div>
              {insights.priceAdvice.minPrice != null &&
                insights.priceAdvice.maxPrice != null && (
                  <p className="mt-1 text-[10px] text-[var(--vauto-teal)]">
                    Rinka {insights.scopeLabel}:{" "}
                    {formatPrice(insights.priceAdvice.minPrice)} –{" "}
                    {formatPrice(insights.priceAdvice.maxPrice)}
                  </p>
                )}
            </div>
          ))}
        </div>
      )}

      {overview.topBoostTips.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
              Kaip iškelti ir paryškinti
            </p>
          </div>
          <div className="space-y-2">
            {overview.topBoostTips.map((tip) => {
              const listingId = overview.listingInsights.find((i) =>
                i.insights.boostTips.some((t) => t.id === tip.id)
              )?.listingId;
              const clickable =
                tip.action === "promote" && listingId && onPromoteListing;

              return (
                <button
                  key={tip.id}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onPromoteListing(listingId)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition",
                    urgencyStyles(tip.urgency),
                    clickable && "hover:brightness-110 active:scale-[0.99]"
                  )}
                >
                  <p className="text-xs font-semibold text-[var(--vauto-text-heading)]">{tip.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--vauto-text-muted)]">
                    {tip.detail}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {overview.avgPrecision === "low" && (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--vauto-text-muted)]">
          Kuo tiksliau užpildysite pavadinimą, aprašymą ir parametrus, tuo
          tikslesnę konkurentų analizę parodysime.
        </p>
      )}
    </div>
  );
}

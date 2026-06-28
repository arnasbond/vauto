"use client";

import { TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import type { PriceAdvice } from "@/lib/price-advisor";
import { formatPrice } from "@/data/mockListings";

interface PriceAdviceCardProps {
  advice: PriceAdvice | null;
}

export function PriceAdviceCard({ advice }: PriceAdviceCardProps) {
  if (!advice) return null;
  if (advice.verdict === "unknown" && advice.sampleSize === 0 && !advice.optimalPrice) {
    return null;
  }

  const icon =
    advice.verdict === "low" ? (
      <TrendingDown className="h-4 w-4 text-emerald-400" />
    ) : advice.verdict === "high" ? (
      <TrendingUp className="h-4 w-4 text-amber-400" />
    ) : (
      <Minus className="h-4 w-4 text-[var(--flux-teal)]" />
    );

  const border =
    advice.verdict === "low"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : advice.verdict === "high"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-[var(--flux-teal)]/30 bg-[var(--flux-teal)]/10";

  const hasRange =
    advice.minPrice != null &&
    advice.maxPrice != null &&
    advice.optimalPrice != null;

  return (
    <div className={`mt-3 flex gap-2 rounded-xl border p-3 ${border}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white">
          {advice.source === "appraisal" ? "AI kainų rekomendacijos" : "AI kainos patarimas"}
          {advice.source === "appraisal" && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--flux-teal)]">
              <Sparkles className="h-2.5 w-2.5" />
              Vision + Rinka
            </span>
          )}
          {advice.source === "market" && (
            <span className="ml-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--flux-teal)]">
              Rinkos duomenys
            </span>
          )}
        </p>
        {hasRange && (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-white/90">
            <span className="rounded-md bg-black/20 px-2 py-0.5">
              Min {formatPrice(advice.minPrice!)}
            </span>
            <span className="rounded-md bg-[var(--flux-teal)]/25 px-2 py-0.5 text-[var(--flux-teal)]">
              Optimal {formatPrice(advice.optimalPrice!)}
            </span>
            <span className="rounded-md bg-black/20 px-2 py-0.5">
              Max {formatPrice(advice.maxPrice!)}
            </span>
            {advice.appraisalScore != null && advice.appraisalScore > 0 && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-white/70">
                Patikimumas {advice.appraisalScore}%
              </span>
            )}
          </div>
        )}
        <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          {advice.message}
        </p>
        {advice.minNegotiationPrice != null && advice.minNegotiationPrice > 0 && (
          <p className="mt-1 text-[10px] text-white/50">
            Derybų dvyniui siūloma min. kaina: {formatPrice(advice.minNegotiationPrice)}
          </p>
        )}
      </div>
    </div>
  );
}

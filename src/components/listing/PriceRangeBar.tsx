"use client";

import { Sparkles } from "lucide-react";
import type { PriceAdvice } from "@/lib/price-advisor";
import { formatPrice } from "@/data/mockListings";
import { cn } from "@/lib/cn";

export interface PriceRangeBarProps {
  advice: PriceAdvice | null;
  draftPrice: number;
  loading?: boolean;
  disabled?: boolean;
  onApplyOptimal?: (optimalPrice: number) => void;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function PriceRangeBar({
  advice,
  draftPrice,
  loading = false,
  disabled = false,
  onApplyOptimal,
}: PriceRangeBarProps) {
  if (loading) {
    return (
      <div
        className="mt-2 rounded-xl border border-[var(--vauto-border)]/70 bg-[var(--vauto-surface-muted)]/30 px-3 py-2.5"
        data-price-range-bar="loading"
        role="status"
      >
        <p className="text-[11px] text-[var(--vauto-text-muted)]">
          Skaičiuojame rinkos kainos rėžį…
        </p>
      </div>
    );
  }

  if (!advice) return null;
  if (
    advice.verdict === "unknown" &&
    advice.sampleSize === 0 &&
    advice.optimalPrice == null
  ) {
    return null;
  }

  const min = advice.minPrice ?? 0;
  const max = advice.maxPrice ?? 0;
  const optimal = advice.optimalPrice ?? advice.medianPrice ?? 0;
  const hasRange = min > 0 && max > 0 && max >= min && optimal > 0;
  const span = hasRange ? Math.max(max - min, 1) : 1;
  const optimalPct = hasRange ? clamp01((optimal - min) / span) * 100 : 50;
  const draftPct = hasRange
    ? clamp01((Math.max(draftPrice, 0) - min) / span) * 100
    : draftPrice > 0
      ? 50
      : 0;

  const verdictLabel =
    advice.verdict === "low"
      ? "Žemiau rinkos"
      : advice.verdict === "high"
        ? "Aukščiau rinkos"
        : advice.verdict === "fair"
          ? "Rinkos zonoje"
          : "Orientyras";

  const tone =
    advice.verdict === "low"
      ? "border-emerald-500/25 bg-emerald-500/8"
      : advice.verdict === "high"
        ? "border-amber-500/25 bg-amber-500/8"
        : "border-[var(--vauto-primary)]/20 bg-[var(--vauto-primary)]/6";

  return (
    <div
      className={cn(
        "mt-2 space-y-2 rounded-xl border px-3 py-2.5",
        tone
      )}
      data-price-range-bar="1"
      data-verdict={advice.verdict}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--vauto-text)]">
          <Sparkles
            className="h-3.5 w-3.5 text-[var(--vauto-primary)]"
            aria-hidden
          />
          AI kainos patarimas
          <span className="font-medium text-[var(--vauto-text-muted)]">
            · {verdictLabel}
          </span>
        </p>
        {advice.sampleSize > 0 ? (
          <span className="text-[10px] text-[var(--vauto-text-muted)]">
            n={advice.sampleSize}
            {advice.appraisalScore != null && advice.appraisalScore > 0
              ? ` · ${Math.round(advice.appraisalScore)}%`
              : ""}
          </span>
        ) : null}
      </div>

      {hasRange ? (
        <div className="space-y-1.5">
          <div
            className="relative h-2.5 overflow-visible rounded-full bg-[var(--vauto-border)]/50"
            aria-hidden
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--vauto-primary)]/35"
              style={{ width: `${optimalPct}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--vauto-primary)] bg-[var(--vauto-card-bg)]"
              style={{ left: `${optimalPct}%` }}
              title={`Optimali ${formatPrice(optimal)}`}
            />
            {draftPrice > 0 ? (
              <div
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--vauto-ink)]"
                style={{ left: `${draftPct}%` }}
                title={`Jūsų kaina ${formatPrice(draftPrice)}`}
              />
            ) : null}
          </div>
          <div className="flex justify-between gap-2 text-[10px] font-medium text-[var(--vauto-text-muted)]">
            <span>Min {formatPrice(min)}</span>
            <span className="text-[var(--vauto-primary)]">
              ~{formatPrice(optimal)}
            </span>
            <span>Max {formatPrice(max)}</span>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] leading-snug text-[var(--vauto-text-muted)]">
        {advice.message}
      </p>
      <p className="text-[10px] text-[var(--vauto-text-muted)]/90">
        Tik patarimas — galite palikti savo kainą. AI pokalbis lieka laisvas.
      </p>

      {onApplyOptimal && optimal > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onApplyOptimal(Math.round(optimal))}
          className="text-[11px] font-semibold text-[var(--vauto-primary)] underline-offset-2 hover:underline disabled:opacity-50"
        >
          Naudoti ~{formatPrice(optimal)}
        </button>
      ) : null}
    </div>
  );
}

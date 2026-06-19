"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { PriceAdvice } from "@/lib/price-advisor";

interface PriceAdviceCardProps {
  advice: PriceAdvice;
}

export function PriceAdviceCard({ advice }: PriceAdviceCardProps) {
  if (advice.verdict === "unknown" && advice.sampleSize === 0) return null;

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

  return (
    <div className={`mt-3 flex gap-2 rounded-xl border p-3 ${border}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-semibold text-white">AI kainos patarimas</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          {advice.message}
        </p>
      </div>
    </div>
  );
}

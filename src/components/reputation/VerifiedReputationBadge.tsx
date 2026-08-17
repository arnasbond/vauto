"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { apiGetUserReputation } from "@/lib/api/deal-room";
import { formatRatingAverage } from "@/lib/deal-status";
import { cn } from "@/lib/cn";

const cache = new Map<
  string,
  { ratingAverage: number | null; totalReviewsCount: number }
>();

export function VerifiedReputationBadge({
  userId,
  compact = false,
  className,
}: {
  userId: string;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "empty" }
    | { kind: "ready"; avg: number; count: number }
    | { kind: "error" }
  >({ kind: "loading" });

  useEffect(() => {
    if (!userId) return;
    const hit = cache.get(userId);
    if (hit) {
      setState(
        hit.totalReviewsCount > 0 && hit.ratingAverage != null
          ? { kind: "ready", avg: hit.ratingAverage, count: hit.totalReviewsCount }
          : { kind: "empty" }
      );
    }
    let cancelled = false;
    void apiGetUserReputation(userId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState(hit ? (hit.totalReviewsCount > 0 && hit.ratingAverage != null
          ? { kind: "ready", avg: hit.ratingAverage, count: hit.totalReviewsCount }
          : { kind: "empty" }) : { kind: "error" });
        return;
      }
      cache.set(userId, {
        ratingAverage: res.data.ratingAverage,
        totalReviewsCount: res.data.totalReviewsCount,
      });
      if (res.data.totalReviewsCount > 0 && res.data.ratingAverage != null) {
        setState({
          kind: "ready",
          avg: res.data.ratingAverage,
          count: res.data.totalReviewsCount,
        });
      } else {
        setState({ kind: "empty" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.kind === "loading") {
    return (
      <span className={cn("text-[11px] text-[var(--ds-text-muted)]", className)}>
        Kraunama reputacija…
      </span>
    );
  }
  if (state.kind === "error" || state.kind === "empty") {
    return (
      <span
        className={cn("text-[11px] text-[var(--ds-text-muted)]", className)}
        data-reputation-empty="1"
        data-verified-review-hint={compact ? undefined : "1"}
      >
        Dar nėra patvirtintų atsiliepimų
        {compact ? null : (
          <span className="block font-normal">
            Patvirtintas atsiliepimas po sandorio
          </span>
        )}
      </span>
    );
  }

  const noun =
    state.count === 1
      ? "atsiliepimas"
      : state.count < 10
        ? "atsiliepimai"
        : "atsiliepimų";
  const avgLabel = formatRatingAverage(state.avg);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium text-amber-800",
        className
      )}
      data-reputation-badge
      data-verified-review-hint={compact ? undefined : "1"}
      title="Patvirtintas atsiliepimas po sandorio"
    >
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
      {compact ? (
        <span>
          {avgLabel} ({state.count})
        </span>
      ) : (
        <span>
          {avgLabel} · {state.count} {noun}
          <span className="ml-1 font-normal text-[var(--ds-text-muted)]">
            · Patvirtintas atsiliepimas po sandorio
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Demand signals with bot / refresh / self-interaction spam resistance.
 */

import type { DemandEvent, DemandInput, ReasonCode, ScoreComponent } from "./types.js";
import { SCORE_WEIGHTS } from "./types.js";

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

const WINDOW_MS = 7 * 86400_000;
/** Same actor+type within this window counts once. */
const DEDUPE_MS = 30 * 60_000;
/** Max events per sessionKey per type per hour. */
const SESSION_CAP_PER_HOUR = 8;

export type NormalizedDemand = {
  views: number;
  favorites: number;
  inquiries: number;
  rawEventCount: number;
  filteredEventCount: number;
  spamFiltered: boolean;
};

/**
 * Normalize demand events: drop self-interactions, burst refresh spam, session floods.
 */
export function normalizeDemandEvents(input: DemandInput): NormalizedDemand {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const owner = input.listingOwnerId ?? null;
  const events = input.events ?? [];
  let filtered = 0;

  const kept: DemandEvent[] = [];
  const lastByActorType = new Map<string, number>();
  const sessionHourCounts = new Map<string, number>();

  for (const ev of events) {
    const t = new Date(ev.at).getTime();
    if (!Number.isFinite(t)) {
      filtered += 1;
      continue;
    }
    if (nowMs - t > WINDOW_MS) {
      filtered += 1;
      continue;
    }
    // Self-interaction
    if (owner && ev.actorId && ev.actorId === owner) {
      filtered += 1;
      continue;
    }

    const actorKey = `${ev.type}|${ev.actorId ?? "anon"}|${ev.sessionKey ?? ""}`;
    const prev = lastByActorType.get(actorKey);
    if (prev != null && t - prev < DEDUPE_MS) {
      filtered += 1;
      continue;
    }

    if (ev.sessionKey) {
      const hourBucket = Math.floor(t / 3_600_000);
      const sk = `${ev.sessionKey}|${ev.type}|${hourBucket}`;
      const c = sessionHourCounts.get(sk) ?? 0;
      if (c >= SESSION_CAP_PER_HOUR) {
        filtered += 1;
        continue;
      }
      sessionHourCounts.set(sk, c + 1);
    }

    lastByActorType.set(actorKey, t);
    kept.push(ev);
  }

  let views = 0;
  let favorites = 0;
  let inquiries = 0;
  for (const ev of kept) {
    if (ev.type === "view") views += 1;
    else if (ev.type === "favorite") favorites += 1;
    else if (ev.type === "inquiry") inquiries += 1;
  }

  return {
    views,
    favorites,
    inquiries,
    rawEventCount: events.length,
    filteredEventCount: filtered,
    spamFiltered: filtered > 0 && filtered >= events.length * 0.3,
  };
}

export function scoreDemand(demand: DemandInput | null | undefined): {
  component: ScoreComponent;
  missing: string[];
} {
  const weight = SCORE_WEIGHTS.demand;
  const missing: string[] = [];
  const reasons: ReasonCode[] = [];

  if (!demand || demand.events == null) {
    missing.push("demand.events");
    reasons.push("DEMAND_SIGNALS_MISSING");
    return {
      component: { score: null, weight, confidence: 0, reasonCodes: reasons },
      missing,
    };
  }

  const norm = normalizeDemandEvents(demand);
  if (norm.spamFiltered) reasons.push("DEMAND_SPAM_FILTERED");

  // Soft saturation curves — spam cannot explode score
  const viewPart = Math.min(40, Math.log10(1 + norm.views) * 22);
  const favPart = Math.min(35, Math.log10(1 + norm.favorites) * 28);
  const inqPart = Math.min(25, Math.log10(1 + norm.inquiries) * 30);
  const score = clampScore(viewPart + favPart + inqPart);

  if (score >= 70) reasons.push("HEALTHY_DEMAND");
  else if (score >= 40) reasons.push("MODERATE_DEMAND");
  else reasons.push("LOW_DEMAND");

  const uniqueSignal =
    (norm.views > 0 ? 1 : 0) +
    (norm.favorites > 0 ? 1 : 0) +
    (norm.inquiries > 0 ? 1 : 0);
  const confidence = Math.min(1, 0.35 + uniqueSignal * 0.2);

  return {
    component: {
      score,
      weight,
      confidence,
      reasonCodes: [...new Set(reasons)],
    },
    missing,
  };
}

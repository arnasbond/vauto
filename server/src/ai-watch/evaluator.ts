/**
 * Event-driven watch evaluator — prefilter + 10B hard constraints + thresholds.
 * NO auto-expansion of user criteria.
 */

import {
  filterListingsByQuery,
  isPublicSearchableListing,
} from "../ai/search/catalog-filter.js";
import type { SearchListingRecord } from "../ai/search/search-schema.js";
import { classifyMeaningfulChange } from "./meaningful-change.js";
import {
  buildEventFingerprint,
  evaluateDedup,
} from "./notification-dedup.js";
import { evaluatePriceDrop } from "./price-drop.js";
import {
  parseAiWatchMatchResult,
  type AiWatchMatchResult,
  type AiWatchRule,
} from "./schema.js";
import type { MatchReasonCode, WatchListingEvent } from "./types.js";
import type { WatchRepository } from "./watch-repository.js";

function toSearchRecord(e: WatchListingEvent): SearchListingRecord {
  return {
    id: e.listingId,
    title: e.title,
    price: e.price,
    location: e.location ?? "",
    category: e.category,
    brand: e.brand,
    model: e.model,
    year: e.year,
    mileage: e.mileage,
    condition: e.condition,
    fuel: e.fuel,
    transmission: e.transmission,
    delivery: e.delivery,
    distanceKm: e.distanceKm,
    createdAt: e.occurredAt,
    sellerVerified: undefined,
    status: e.status,
    banned: e.banned,
    requiresReview: e.requiresReview,
    visibility: e.visibility,
    ownerUserId: e.ownerUserId ?? undefined,
  };
}

/**
 * Cheap prefilter — avoid evaluating unrelated watches (event-driven, not full scan).
 */
export function prefilterRules(
  rules: AiWatchRule[],
  event: WatchListingEvent
): AiWatchRule[] {
  return rules.filter((rule) => {
    if (rule.status !== "ACTIVE") return false;

    if (rule.type === "LISTING_PRICE_WATCH") {
      return rule.targetListingId === event.listingId;
    }

    const q = rule.structuredQuery;
    if (q.category) {
      if (
        String(q.category).toLowerCase() !== String(event.category).toLowerCase()
      ) {
        return false;
      }
    }
    if (q.priceMax != null && event.price > q.priceMax) return false;
    if (q.priceMin != null && event.price < q.priceMin) return false;
    if (q.brand) {
      if (
        String(q.brand).toLowerCase() !== String(event.brand ?? "").toLowerCase()
      ) {
        return false;
      }
    }
    // Region soft prefilter via location substring when query.location set
    if (q.location && event.location) {
      if (
        !event.location.toLowerCase().includes(String(q.location).toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  });
}

function fail(
  rule: AiWatchRule,
  event: WatchListingEvent,
  reasons: MatchReasonCode[],
  at: string,
  extras?: Partial<AiWatchMatchResult>
): AiWatchMatchResult {
  return parseAiWatchMatchResult({
    ruleId: rule.id,
    userId: rule.userId,
    listingId: event.listingId,
    isMatch: false,
    matchReasons: reasons,
    vautoScore: event.vautoScore ?? null,
    buyerMatchScore: event.buyerMatchScore ?? null,
    shouldNotify: false,
    evaluatedAt: at,
    cooldownPassed: false,
    ...extras,
  });
}

/**
 * Evaluate a single ACTIVE rule against an event (deterministic).
 */
export async function evaluateWatchRule(
  store: WatchRepository,
  rule: AiWatchRule,
  event: WatchListingEvent,
  now = new Date()
): Promise<AiWatchMatchResult> {
  const at = now.toISOString();

  if (rule.status !== "ACTIVE") {
    return fail(rule, event, ["NOT_ACTIVE_RULE"], at);
  }

  // Private / hidden / banned never notify
  const rec = toSearchRecord(event);
  if (!isPublicSearchableListing(rec)) {
    return fail(rule, event, ["NOT_PUBLIC_LISTING"], at);
  }

  // Meaningful change gate for updates
  const change = classifyMeaningfulChange(
    event.previousSnapshot,
    event.currentSnapshot ?? {
      price: event.price,
      title: event.title,
      status: event.status,
      visibility: event.visibility,
      year: event.year,
      mileage: event.mileage,
      brand: event.brand,
      model: event.model,
    },
    event.eventType
  );
  if (!change.meaningful) {
    return fail(rule, event, ["NO_MEANINGFUL_CHANGE"], at);
  }

  const reasons: MatchReasonCode[] = ["MEANINGFUL_CHANGE"];

  // LISTING_PRICE_WATCH
  if (rule.type === "LISTING_PRICE_WATCH") {
    if (rule.targetListingId !== event.listingId) {
      return fail(rule, event, ["PREFILTER_MISS"], at);
    }
    const drop = evaluatePriceDrop(event.price, event.previousPrice, {
      minDropPercent: rule.thresholds?.priceDropPercent,
      priceBelow: rule.thresholds?.priceBelow,
    });
    if (!drop.dropped) {
      return fail(rule, event, ["THRESHOLD_FAIL"], at);
    }
    for (const r of drop.reasons) {
      if (r === "PRICE_DROP_PERCENT" || r === "PRICE_BELOW_THRESHOLD") {
        reasons.push(r);
      }
    }
    reasons.push("LISTING_PRICE_WATCH_HIT");
  } else {
    // SEARCH_WATCH — hard constraints via 10B filter (no expansion)
    const passed = filterListingsByQuery([rec], rule.structuredQuery);
    if (passed.length === 0) {
      return fail(rule, event, ["HARD_CONSTRAINT_FAIL"], at);
    }
    reasons.push("HARD_CONSTRAINTS_PASSED", "SEARCH_WATCH_HIT");
    if (event.eventType === "listing_created") {
      reasons.push("NEW_LISTING_MATCH");
    }
  }

  // Optional distance threshold
  if (rule.thresholds?.maxDistanceKm != null) {
    if (
      event.distanceKm == null ||
      event.distanceKm > rule.thresholds.maxDistanceKm
    ) {
      return fail(rule, event, ["THRESHOLD_FAIL", ...reasons], at);
    }
    reasons.push("DISTANCE_WITHIN_MAX");
  }

  // Optional VAUTO Score threshold
  if (rule.thresholds?.minVautoScore != null) {
    if (
      event.vautoScore == null ||
      event.vautoScore < rule.thresholds.minVautoScore
    ) {
      return fail(rule, event, ["THRESHOLD_FAIL", ...reasons], at);
    }
    reasons.push("VAUTO_SCORE_THRESHOLD");
  }

  // Optional Buyer Match threshold
  if (rule.thresholds?.minBuyerMatch != null) {
    if (
      event.buyerMatchScore == null ||
      event.buyerMatchScore < rule.thresholds.minBuyerMatch
    ) {
      return fail(rule, event, ["THRESHOLD_FAIL", ...reasons], at);
    }
    reasons.push("BUYER_MATCH_THRESHOLD");
  }

  // SEARCH_WATCH price-drop thresholds (optional additive)
  if (rule.type === "SEARCH_WATCH") {
    const drop = evaluatePriceDrop(event.price, event.previousPrice, {
      minDropPercent: rule.thresholds?.priceDropPercent,
      priceBelow: rule.thresholds?.priceBelow,
    });
    if (rule.thresholds?.priceDropPercent != null || rule.thresholds?.priceBelow != null) {
      if (!drop.dropped) {
        return fail(rule, event, ["THRESHOLD_FAIL", ...reasons], at);
      }
      for (const r of drop.reasons) {
        if (r === "PRICE_DROP_PERCENT" || r === "PRICE_BELOW_THRESHOLD") {
          reasons.push(r);
        }
      }
    }
  }

  const fingerprint = buildEventFingerprint(
    rule.id,
    event.listingId,
    event.eventType,
    change.reasons.sort().join(",") + `|${event.price}`
  );

  const dedup = await evaluateDedup(store, rule, event, fingerprint, now);
  const isMatch = true;
  let shouldNotify = isMatch && dedup.allow;
  const matchReasons = [...new Set(reasons)] as MatchReasonCode[];
  if (!dedup.allow && dedup.reason) {
    matchReasons.push(dedup.reason);
    shouldNotify = false;
  }

  return parseAiWatchMatchResult({
    ruleId: rule.id,
    userId: rule.userId,
    listingId: event.listingId,
    isMatch,
    matchReasons,
    vautoScore: event.vautoScore ?? null,
    buyerMatchScore: event.buyerMatchScore ?? null,
    shouldNotify,
    evaluatedAt: at,
    eventFingerprint: fingerprint,
    cooldownPassed: dedup.cooldownPassed,
  });
}

/**
 * Evaluate event against prefiltered active rules.
 */
export async function evaluateListingEvent(
  store: WatchRepository,
  event: WatchListingEvent,
  now = new Date()
): Promise<AiWatchMatchResult[]> {
  const active = await Promise.resolve(store.listActiveRules());
  const candidates = prefilterRules(active, event);
  return Promise.all(
    candidates.map((rule) => evaluateWatchRule(store, rule, event, now))
  );
}

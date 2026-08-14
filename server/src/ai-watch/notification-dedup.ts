/**
 * Notification deduplication — fingerprint ledger, cooldown, daily cap.
 */

import { createHash } from "node:crypto";
import type { AiWatchRule } from "./schema.js";
import type { WatchRepository } from "./watch-repository.js";
import {
  WATCH_COOLDOWN_MS,
  WATCH_DAILY_CAP,
  type WatchEventType,
  type WatchListingEvent,
} from "./types.js";

export function buildEventFingerprint(
  ruleId: string,
  listingId: string,
  eventType: WatchEventType,
  meaningfulKey: string
): string {
  const raw = `${ruleId}|${listingId}|${eventType}|${meaningfulKey}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export type DedupDecision = {
  allow: boolean;
  cooldownPassed: boolean;
  reason?: "DEDUP_BLOCKED" | "COOLDOWN_BLOCKED" | "DAILY_CAP_BLOCKED";
};

export async function evaluateDedup(
  store: WatchRepository,
  rule: AiWatchRule,
  event: WatchListingEvent,
  fingerprint: string,
  now = new Date()
): Promise<DedupDecision> {
  if (await Promise.resolve(store.hasFingerprint(rule.userId, fingerprint))) {
    return { allow: false, cooldownPassed: false, reason: "DEDUP_BLOCKED" };
  }

  const last = await Promise.resolve(
    store.lastNotificationForRuleListing(
      rule.userId,
      rule.id,
      event.listingId
    )
  );
  if (last) {
    const elapsed = now.getTime() - new Date(last.createdAt).getTime();
    if (elapsed < WATCH_COOLDOWN_MS) {
      return { allow: false, cooldownPassed: false, reason: "COOLDOWN_BLOCKED" };
    }
  }

  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
  const dayCount = await Promise.resolve(
    store.countNotificationsForUserSince(rule.userId, dayStart)
  );
  if (dayCount >= WATCH_DAILY_CAP) {
    return { allow: false, cooldownPassed: true, reason: "DAILY_CAP_BLOCKED" };
  }

  return { allow: true, cooldownPassed: true };
}

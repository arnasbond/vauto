/**
 * AI Watch Engine 1.0 — orchestration with race-safe notification insert.
 */

import { evaluateListingEvent } from "./evaluator.js";
import { formatWatchNotification } from "./explanation.js";
import type { AiWatchMatchResult, AiWatchNotification, AiWatchRule } from "./schema.js";
import type { WatchListingEvent } from "./types.js";
import type { WatchRepository } from "./watch-repository.js";

export type ProcessEventResult = {
  matches: AiWatchMatchResult[];
  notifications: AiWatchNotification[];
};

/**
 * Process a listing event: prefilter → evaluate → notify (deduped).
 */
export async function processWatchEvent(
  store: WatchRepository,
  event: WatchListingEvent,
  opts?: { now?: Date; llm?: Parameters<typeof formatWatchNotification>[2] }
): Promise<ProcessEventResult> {
  const now = opts?.now ?? new Date();
  const matches = await evaluateListingEvent(store, event, now);
  const notifications: AiWatchNotification[] = [];

  for (const match of matches) {
    await Promise.resolve(store.markEvaluated(match.ruleId, match.evaluatedAt));
    if (!match.shouldNotify || !match.isMatch || !match.eventFingerprint) {
      continue;
    }

    const lockKey = `${match.userId}::${match.eventFingerprint}`;
    const inserted = await store.withLock(lockKey, async () => {
      if (
        await Promise.resolve(
          store.hasFingerprint(match.userId, match.eventFingerprint!)
        )
      ) {
        return null;
      }
      const text = await formatWatchNotification(event, match, opts?.llm);
      return Promise.resolve(
        store.tryInsertNotification({
          userId: match.userId,
          ruleId: match.ruleId,
          listingId: match.listingId,
          eventFingerprint: match.eventFingerprint!,
          title: text.title,
          body: text.body,
          createdAt: now.toISOString(),
        })
      );
    });

    if (inserted) {
      notifications.push(inserted);
      await Promise.resolve(store.markNotified(match.ruleId, now.toISOString()));
    }
  }

  return { matches, notifications };
}

export type { AiWatchRule, AiWatchMatchResult, WatchListingEvent, WatchRepository };

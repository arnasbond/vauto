/**
 * Watch repository contract — ownership always scoped by authenticated userId.
 * In-memory for unit tests; PostgreSQL for production.
 */

import type { SearchQuery } from "../ai/search/search-schema.js";
import type { AiWatchNotification, AiWatchRule } from "./schema.js";
import type { WatchThresholds } from "./types.js";

export type MaybePromise<T> = T | Promise<T>;

export type CreateWatchInput = {
  userId: string;
  name: string;
  type: AiWatchRule["type"];
  structuredQuery: SearchQuery;
  thresholds?: WatchThresholds;
  targetListingId?: string;
};

export type WatchRepository = {
  withLock<T>(key: string, fn: () => MaybePromise<T>): Promise<T>;
  create(input: CreateWatchInput): MaybePromise<AiWatchRule>;
  getForUser(ruleId: string, userId: string): MaybePromise<AiWatchRule | null>;
  listForUser(userId: string): MaybePromise<AiWatchRule[]>;
  listActiveRules(): MaybePromise<AiWatchRule[]>;
  updateStatus(
    ruleId: string,
    userId: string,
    status: AiWatchRule["status"]
  ): MaybePromise<AiWatchRule | null>;
  updateRule(
    ruleId: string,
    userId: string,
    patch: Partial<
      Pick<AiWatchRule, "name" | "thresholds" | "structuredQuery" | "status">
    >
  ): MaybePromise<AiWatchRule | null>;
  softDelete(ruleId: string, userId: string): MaybePromise<boolean>;
  markEvaluated(ruleId: string, at: string): MaybePromise<void>;
  markNotified(ruleId: string, at: string): MaybePromise<void>;
  hasFingerprint(userId: string, fingerprint: string): MaybePromise<boolean>;
  tryInsertNotification(
    n: Omit<AiWatchNotification, "id" | "watchVersion"> & { id?: string }
  ): MaybePromise<AiWatchNotification | null>;
  listNotificationsForUser(
    userId: string
  ): MaybePromise<AiWatchNotification[]>;
  countNotificationsForUserSince(
    userId: string,
    sinceIso: string
  ): MaybePromise<number>;
  lastNotificationForRuleListing(
    userId: string,
    ruleId: string,
    listingId: string
  ): MaybePromise<AiWatchNotification | null>;
};

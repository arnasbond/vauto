export { AI_WATCH_VERSION } from "./version.js";
export {
  WATCH_COOLDOWN_MS,
  WATCH_DAILY_CAP,
  MATCH_REASON_ALLOWLIST,
  MATCH_REASON_SET,
  isAllowedMatchReason,
  type WatchListingEvent,
  type WatchThresholds,
  type WatchEventType,
  type MatchReasonCode,
} from "./types.js";
export {
  AiWatchRuleSchema,
  AiWatchMatchResultSchema,
  AiWatchNotificationSchema,
  WatchThresholdsSchema,
  parseAiWatchRule,
  parseAiWatchMatchResult,
  parseAiWatchNotification,
  type AiWatchRule,
  type AiWatchMatchResult,
  type AiWatchNotification,
} from "./schema.js";
export {
  AI_WATCH_MIGRATION_SQL,
  AI_WATCH_MIGRATION_ID,
} from "./db-schema.js";
export type {
  CreateWatchInput,
  WatchRepository,
  MaybePromise,
} from "./watch-repository.js";
export {
  InMemoryWatchRepository,
  WatchStore,
  defaultWatchStore,
} from "./watch-store.js";
export {
  AiWatchRepository,
  getAiWatchRepository,
  createAiWatchRepository,
} from "./ai-watch-repository.js";
export {
  evaluateWatchRule,
  evaluateListingEvent,
  prefilterRules,
} from "./evaluator.js";
export { evaluatePriceDrop } from "./price-drop.js";
export { classifyMeaningfulChange } from "./meaningful-change.js";
export {
  buildEventFingerprint,
  evaluateDedup,
} from "./notification-dedup.js";
export {
  formatWatchNotification,
  buildTemplateNotification,
  notificationTextGuard,
} from "./explanation.js";
export { processWatchEvent, type ProcessEventResult } from "./watch-engine.js";
export {
  enqueueAiWatchOutbox,
  processAiWatchOutboxBatch,
  startAiWatchOutboxWorker,
  stopAiWatchOutboxWorker,
  kickAiWatchOutboxWorker,
} from "./outbox.js";
export {
  listingToWatchEvent,
  scheduleAiWatchForListing,
  scheduleAiWatchForListingDurable,
} from "./listing-hooks.js";


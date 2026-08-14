/**
 * Stage 11I.1 — Reputation Engine public exports.
 */

export {
  REPUTATION_ENGINE_VERSION,
  type ReputationEngineVersion,
} from "./version.js";

export {
  REVIEW_RATINGS,
  REVIEW_ELIGIBLE_TX_STATUS,
  ReputationForbiddenError,
  ReputationConflictError,
  ReputationNotFoundError,
  type ReviewRating,
  type VautoReview,
  type ReviewSubmitResult,
  type UserReputation,
} from "./types.js";

export {
  SubmitReviewBodySchema,
  VautoReviewSchema,
  ReviewSubmitResponseSchema,
  UserReputationResponseSchema,
} from "./schema.js";

export { ReviewRepository } from "./review-repository.js";

export {
  ReputationService,
  createReputationService,
  REPUTATION_MIGRATION_SQL,
  REPUTATION_MIGRATION_ID,
} from "./reputation-service.js";

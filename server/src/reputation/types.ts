/**
 * Stage 11I.1 — Verified reviews domain types.
 */

import type { REPUTATION_ENGINE_VERSION } from "./version.js";

export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

/** Only COMPLETED (paid, fulfilled) deals may receive a review. */
export const REVIEW_ELIGIBLE_TX_STATUS = "COMPLETED" as const;

export const REVIEW_VERIFICATION_LEVELS = [
  "L1_PLATFORM_TRANSACTION",
  "L2_INTERACTION",
  "L3_CONTRACT",
  "L0_UNVERIFIED",
] as const;
export type ReviewVerificationLevel =
  (typeof REVIEW_VERIFICATION_LEVELS)[number];

export type VautoReview = {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: ReviewRating;
  comment: string | null;
  createdAt: string;
  reputationEngineVersion: typeof REPUTATION_ENGINE_VERSION;
  verificationLevel: ReviewVerificationLevel;
};

export type ReviewSubmitResult = {
  review: VautoReview;
  reputationEngineVersion: typeof REPUTATION_ENGINE_VERSION;
};

export type UserReputation = {
  userId: string;
  ratingAverage: number | null;
  totalReviewsCount: number;
  reviews: VautoReview[];
  reputationEngineVersion: typeof REPUTATION_ENGINE_VERSION;
};

export class ReputationForbiddenError extends Error {
  readonly code = "REPUTATION_FORBIDDEN" as const;
  readonly httpStatus = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ReputationForbiddenError";
  }
}

export class ReputationConflictError extends Error {
  readonly code = "REPUTATION_CONFLICT" as const;
  readonly httpStatus = 409;
  constructor(message = "Review already submitted for this transaction") {
    super(message);
    this.name = "ReputationConflictError";
  }
}

export class ReputationNotFoundError extends Error {
  readonly code = "REPUTATION_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "ReputationNotFoundError";
  }
}

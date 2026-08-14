/**
 * Stage 11I.1 — Zod strict schemas for review HTTP bodies / responses.
 */

import { z } from "zod";
import { REPUTATION_ENGINE_VERSION } from "./version.js";

export const SubmitReviewBodySchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(1).max(4000).optional(),
  })
  .strict();

export const VautoReviewSchema = z
  .object({
    id: z.string().min(1),
    transactionId: z.string().min(1),
    reviewerId: z.string().min(1),
    revieweeId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    createdAt: z.string().min(1),
    reputationEngineVersion: z.literal(REPUTATION_ENGINE_VERSION),
  })
  .strict();

export const ReviewSubmitResponseSchema = z
  .object({
    review: VautoReviewSchema,
    reputationEngineVersion: z.literal(REPUTATION_ENGINE_VERSION),
  })
  .strict();

export const UserReputationResponseSchema = z
  .object({
    userId: z.string().min(1),
    ratingAverage: z.number().nullable(),
    totalReviewsCount: z.number().int().nonnegative(),
    reviews: z.array(VautoReviewSchema),
    reputationEngineVersion: z.literal(REPUTATION_ENGINE_VERSION),
  })
  .strict();

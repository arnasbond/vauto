/**
 * Stage 11I.1 — Verified Reviews: COMPLETED deals only, one review per party.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../transaction/index.js";
import { ReviewRepository } from "./review-repository.js";
import { SubmitReviewBodySchema } from "./schema.js";
import { REPUTATION_ENGINE_VERSION } from "./version.js";
import {
  REVIEW_ELIGIBLE_TX_STATUS,
  ReputationConflictError,
  ReputationForbiddenError,
  ReputationNotFoundError,
  type ReviewSubmitResult,
  type UserReputation,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPUTATION_MIGRATION_ID = "057_reputation_reviews_1.0";
export const REPUTATION_MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../migrations/057_reputation_reviews_1.0.sql"),
  "utf8"
);

function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  if (err.code === "23505") return true;
  return /uq_vauto_reviews_txn_reviewer|unique/i.test(String(err.message ?? ""));
}

export class ReputationService {
  constructor(private readonly db: TxQueryable) {}

  async submitReview(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<ReviewSubmitResult> {
    const body = SubmitReviewBodySchema.parse(input.body);

    try {
      const review = await runQueryableTransaction(this.db, async (tx) => {
        const txRepo = new TransactionRepository(tx);
        const reviews = new ReviewRepository(tx);
        const txn = await txRepo.getById(input.transactionId);
        if (!txn) throw new ReputationNotFoundError();

        const isBuyer = txn.buyerId === input.actorUserId;
        const isSeller = txn.sellerId === input.actorUserId;
        if (!isBuyer && !isSeller) {
          throw new ReputationForbiddenError(
            "Only the buyer or seller of this transaction may leave a review"
          );
        }

        if (txn.status !== REVIEW_ELIGIBLE_TX_STATUS) {
          throw new ReputationForbiddenError(
            `Review requires COMPLETED transaction; got ${txn.status}`
          );
        }

        const revieweeId = isBuyer ? txn.sellerId : txn.buyerId;
        if (input.actorUserId === revieweeId) {
          throw new ReputationForbiddenError("Self-review is forbidden");
        }

        const existing = await reviews.getByTransactionAndReviewer(
          input.transactionId,
          input.actorUserId
        );
        if (existing) {
          throw new ReputationConflictError();
        }

        return reviews.insert({
          transactionId: input.transactionId,
          reviewerId: input.actorUserId,
          revieweeId,
          rating: body.rating as 1 | 2 | 3 | 4 | 5,
          comment: body.comment ?? null,
        });
      });

      return {
        review,
        reputationEngineVersion: REPUTATION_ENGINE_VERSION,
      };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ReputationConflictError();
      }
      throw e;
    }
  }

  async listTransactionReviews(input: {
    transactionId: string;
    actorUserId: string;
  }): Promise<{ reviews: import("./types.js").VautoReview[] }> {
    const txRepo = new TransactionRepository(this.db);
    const txn = await txRepo.getById(input.transactionId);
    if (!txn) throw new ReputationNotFoundError();
    const isParty =
      txn.buyerId === input.actorUserId || txn.sellerId === input.actorUserId;
    if (!isParty) throw new ReputationForbiddenError();
    const reviews = new ReviewRepository(this.db);
    return { reviews: await reviews.listByTransaction(input.transactionId) };
  }

  async getUserReputation(userId: string): Promise<UserReputation> {
    const reviews = new ReviewRepository(this.db);
    const agg = await reviews.aggregateForReviewee(userId);
    const list = await reviews.listByReviewee(userId);
    return {
      userId,
      ratingAverage: agg.ratingAverage,
      totalReviewsCount: agg.totalReviewsCount,
      reviews: list,
      reputationEngineVersion: REPUTATION_ENGINE_VERSION,
    };
  }
}

export function createReputationService(db: TxQueryable): ReputationService {
  return new ReputationService(db);
}

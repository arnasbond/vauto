/**
 * Stage 11I.1 — vauto_reviews repository.
 */

import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/index.js";
import { REPUTATION_ENGINE_VERSION } from "./version.js";
import type { ReviewRating, ReviewVerificationLevel, VautoReview } from "./types.js";

type ReviewRow = {
  id: string;
  transaction_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number | string;
  comment: string | null;
  reputation_engine_version: string;
  created_at: string | Date;
  verification_level?: string;
};

function mapRow(r: ReviewRow): VautoReview {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    reviewerId: r.reviewer_id,
    revieweeId: r.reviewee_id,
    rating: Number(r.rating) as ReviewRating,
    comment: r.comment,
    createdAt:
      typeof r.created_at === "string"
        ? r.created_at
        : r.created_at.toISOString(),
    reputationEngineVersion: REPUTATION_ENGINE_VERSION,
    verificationLevel:
      (r.verification_level as ReviewVerificationLevel | undefined) ??
      "L1_PLATFORM_TRANSACTION",
  };
}

export class ReviewRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionAndReviewer(
    transactionId: string,
    reviewerId: string
  ): Promise<VautoReview | null> {
    const res = await this.db.query<ReviewRow>(
      `SELECT * FROM vauto_reviews
       WHERE transaction_id = $1 AND reviewer_id = $2
       LIMIT 1`,
      [transactionId, reviewerId]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async listByTransaction(transactionId: string): Promise<VautoReview[]> {
    const res = await this.db.query<ReviewRow>(
      `SELECT * FROM vauto_reviews
       WHERE transaction_id = $1
       ORDER BY created_at ASC, id ASC`,
      [transactionId]
    );
    return res.rows.map(mapRow);
  }

  async listByReviewee(revieweeId: string): Promise<VautoReview[]> {
    const res = await this.db.query<ReviewRow>(
      `SELECT * FROM vauto_reviews
       WHERE reviewee_id = $1
       ORDER BY created_at DESC, id DESC`,
      [revieweeId]
    );
    return res.rows.map(mapRow);
  }

  async aggregateForReviewee(revieweeId: string): Promise<{
    ratingAverage: number | null;
    totalReviewsCount: number;
  }> {
    const res = await this.db.query<{
      rating_average: string | number | null;
      total_reviews_count: number | string;
    }>(
      `SELECT
         ROUND(AVG(rating)::numeric, 2) AS rating_average,
         COUNT(*)::int AS total_reviews_count
       FROM vauto_reviews
       WHERE reviewee_id = $1`,
      [revieweeId]
    );
    const row = res.rows[0];
    const count = Number(row?.total_reviews_count ?? 0);
    if (count === 0) {
      return { ratingAverage: null, totalReviewsCount: 0 };
    }
    return {
      ratingAverage: Number(row!.rating_average),
      totalReviewsCount: count,
    };
  }

  async insert(input: {
    transactionId: string;
    reviewerId: string;
    revieweeId: string;
    rating: ReviewRating;
    comment: string | null;
    verificationLevel?: ReviewVerificationLevel;
  }): Promise<VautoReview> {
    const id = `rev_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<ReviewRow>(
      `INSERT INTO vauto_reviews (
         id, transaction_id, reviewer_id, reviewee_id, rating, comment,
         reputation_engine_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.reviewerId,
        input.revieweeId,
        input.rating,
        input.comment,
        REPUTATION_ENGINE_VERSION,
      ]
    );
    const created = mapRow(res.rows[0]!);
    const level = input.verificationLevel ?? "L1_PLATFORM_TRANSACTION";
    if (level === "L1_PLATFORM_TRANSACTION") return created;
    const col = await this.db.query<{ exists: boolean | string | number }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'vauto_reviews' AND column_name = 'verification_level'
       ) AS exists`
    );
    const hasCol =
      col.rows[0]?.exists === true ||
      col.rows[0]?.exists === "t" ||
      col.rows[0]?.exists === 1;
    if (!hasCol) {
      return { ...created, verificationLevel: level };
    }
    const updated = await this.db.query<ReviewRow>(
      `UPDATE vauto_reviews SET verification_level = $1 WHERE id = $2 RETURNING *`,
      [level, created.id]
    );
    return updated.rows[0]
      ? mapRow(updated.rows[0])
      : { ...created, verificationLevel: level };
  }
}

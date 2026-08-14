/**
 * Stage 11I.1 — Reputation Engine & Verified Reviews (120+ tests).
 * PGlite + optional real Postgres 16 via TEST_DATABASE_URL.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  createPoolTxQueryableFromPool,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  REPUTATION_ENGINE_VERSION,
  REPUTATION_MIGRATION_SQL,
  ReviewSubmitResponseSchema,
  UserReputationResponseSchema,
  ReputationForbiddenError,
  ReputationConflictError,
  ReputationNotFoundError,
  createReputationService,
  type ReviewRating,
} from "../index.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const USE_REAL_PG = Boolean(TEST_URL);

const NON_COMPLETED: string[] = [
  "DISCUSSION",
  "OFFER_PENDING",
  "NEGOTIATING",
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
];

function adaptPglite(db: PGlite): TxQueryable {
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as never[]);
      return {
        rows: (res.rows ?? []) as never[],
        rowCount: res.affectedRows ?? null,
      };
    },
  };
}

describe("11I.1 Reputation Engine & Verified Reviews", () => {
  let pool: pg.Pool | null = null;
  let pglite: PGlite | null = null;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let seq = 0;

  async function applySql(sql: string) {
    if (pool) {
      const c = await pool.connect();
      try {
        await c.query(sql);
      } finally {
        c.release();
      }
      return;
    }
    await pglite!.exec(sql);
  }

  before(async () => {
    if (USE_REAL_PG) {
      pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
      q = createPoolTxQueryableFromPool(pool) as TxQueryable;
    } else {
      pglite = new PGlite();
      q = adaptPglite(pglite);
    }
    await applySql(TRANSACTION_MIGRATION_SQL);
    await applySql(REPUTATION_MIGRATION_SQL);
    txRepo = new TransactionRepository(q);
  });

  after(async () => {
    if (pool) await pool.end();
    if (pglite) await pglite.close();
  });

  async function insertTx(input: {
    status: string;
    buyerId: string;
    sellerId: string;
    listingId?: string;
  }) {
    const id = `txn_rep_${randomUUID().replace(/-/g, "")}`;
    await q.query(
      `INSERT INTO vauto_transactions (
         id, listing_id, buyer_id, seller_id, status, current_price, currency,
         version, state_machine_version
       ) VALUES ($1,$2,$3,$4,$5,100,'EUR',0,'1.0')`,
      [
        id,
        input.listingId ?? `L-rep-${++seq}`,
        input.buyerId,
        input.sellerId,
        input.status,
      ]
    );
    return id;
  }

  it("exports reputationEngineVersion 1.0", () => {
    assert.equal(REPUTATION_ENGINE_VERSION, "1.0");
  });

  // —— 30 eligibility: only COMPLETED ——
  for (let i = 0; i < 30; i++) {
    it(`review eligibility COMPLETED-only #${i}`, async () => {
      const buyerId = `b-el-${i}`;
      const sellerId = `s-el-${i}`;
      const svc = createReputationService(q);
      if (i < 12) {
        const status = NON_COMPLETED[i]!;
        const txId = await insertTx({ status, buyerId, sellerId });
        await assert.rejects(
          () =>
            svc.submitReview({
              transactionId: txId,
              actorUserId: buyerId,
              body: { rating: 5, comment: `too early ${status}` },
            }),
          (e: unknown) => e instanceof ReputationForbiddenError
        );
        const rep = await svc.getUserReputation(sellerId);
        assert.equal(rep.totalReviewsCount, 0);
        return;
      }
      const txId = await insertTx({
        status: "COMPLETED",
        buyerId,
        sellerId,
      });
      const res = await svc.submitReview({
        transactionId: txId,
        actorUserId: i % 2 === 0 ? buyerId : sellerId,
        body: { rating: ((i % 5) + 1) as ReviewRating },
      });
      assert.equal(res.review.transactionId, txId);
      assert.notEqual(res.review.reviewerId, res.review.revieweeId);
      ReviewSubmitResponseSchema.parse(res);
      const live = await txRepo.getById(txId);
      assert.equal(live!.status, "COMPLETED");
    });
  }

  // —— 30 fake review prevention ——
  for (let i = 0; i < 30; i++) {
    it(`fake review prevention #${i}`, async () => {
      const buyerId = `b-fk-${i}`;
      const sellerId = `s-fk-${i}`;
      const svc = createReputationService(q);
      if (i < 10) {
        const txId = await insertTx({
          status: "COMPLETED",
          buyerId,
          sellerId,
        });
        await assert.rejects(
          () =>
            svc.submitReview({
              transactionId: txId,
              actorUserId: `stranger-${i}`,
              body: { rating: 1, comment: "fake" },
            }),
          (e: unknown) => e instanceof ReputationForbiddenError
        );
        return;
      }
      if (i < 20) {
        const status = NON_COMPLETED[i % NON_COMPLETED.length]!;
        const txId = await insertTx({ status, buyerId, sellerId });
        await assert.rejects(
          () =>
            svc.submitReview({
              transactionId: txId,
              actorUserId: `stranger-u-${i}`,
              body: { rating: 5 },
            }),
          (e: unknown) => e instanceof ReputationForbiddenError
        );
        return;
      }
      if (i < 25) {
        await assert.rejects(
          () =>
            svc.submitReview({
              transactionId: `missing-${i}`,
              actorUserId: buyerId,
              body: { rating: 4 },
            }),
          (e: unknown) => e instanceof ReputationNotFoundError
        );
        return;
      }
      const txId = await insertTx({
        status: "CANCELLED",
        buyerId,
        sellerId,
      });
      await assert.rejects(
        () =>
          svc.submitReview({
            transactionId: txId,
            actorUserId: buyerId,
            body: { rating: 2, comment: "cancelled deal" },
          }),
        (e: unknown) => e instanceof ReputationForbiddenError
      );
    });
  }

  // —— 30 duplicate prevention ——
  for (let i = 0; i < 30; i++) {
    it(`duplicate review prevention #${i}`, async () => {
      const buyerId = `b-dup-${i}`;
      const sellerId = `s-dup-${i}`;
      const txId = await insertTx({
        status: "COMPLETED",
        buyerId,
        sellerId,
      });
      const svc = createReputationService(q);
      const first = await svc.submitReview({
        transactionId: txId,
        actorUserId: buyerId,
        body: { rating: 5, comment: `first ${i}` },
      });
      assert.equal(first.review.rating, 5);
      await assert.rejects(
        () =>
          svc.submitReview({
            transactionId: txId,
            actorUserId: buyerId,
            body: { rating: 1, comment: "second attempt" },
          }),
        (e: unknown) => e instanceof ReputationConflictError
      );
      if (i % 3 === 0) {
        const settled = await Promise.allSettled([
          svc.submitReview({
            transactionId: txId,
            actorUserId: sellerId,
            body: { rating: 4 },
          }),
          svc.submitReview({
            transactionId: txId,
            actorUserId: sellerId,
            body: { rating: 3 },
          }),
        ]);
        const ok = settled.filter((s) => s.status === "fulfilled");
        const bad = settled.filter((s) => s.status === "rejected");
        assert.equal(ok.length, 1);
        assert.equal(bad.length, 1);
        assert.ok(
          bad[0]!.status === "rejected" &&
            bad[0].reason instanceof ReputationConflictError
        );
      } else {
        const sellerRev = await svc.submitReview({
          transactionId: txId,
          actorUserId: sellerId,
          body: { rating: 4 },
        });
        assert.equal(sellerRev.review.reviewerId, sellerId);
        await assert.rejects(
          () =>
            svc.submitReview({
              transactionId: txId,
              actorUserId: sellerId,
              body: { rating: 5 },
            }),
          (e: unknown) => e instanceof ReputationConflictError
        );
      }
      const count = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_reviews WHERE transaction_id = $1`,
        [txId]
      );
      assert.ok(count.rows[0]!.c <= 2);
      assert.ok(count.rows[0]!.c >= 1);
    });
  }

  // —— 30 aggregation ——
  for (let i = 0; i < 30; i++) {
    it(`rating aggregation #${i}`, async () => {
      const sellerId = `s-agg-${i}`;
      const svc = createReputationService(q);
      const ratings: ReviewRating[] = [];
      const n = (i % 5) + 1;
      for (let k = 0; k < n; k++) {
        const rating = (((i + k) % 5) + 1) as ReviewRating;
        ratings.push(rating);
        const buyerId = `b-agg-${i}-${k}`;
        const txId = await insertTx({
          status: "COMPLETED",
          buyerId,
          sellerId,
        });
        await svc.submitReview({
          transactionId: txId,
          actorUserId: buyerId,
          body: { rating, comment: `agg ${i}-${k}` },
        });
      }
      const expected =
        Math.round(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100
        ) / 100;
      const rep = await svc.getUserReputation(sellerId);
      UserReputationResponseSchema.parse(rep);
      assert.equal(rep.totalReviewsCount, n);
      assert.equal(rep.reviews.length, n);
      assert.equal(rep.ratingAverage, expected);
      assert.equal(rep.reputationEngineVersion, REPUTATION_ENGINE_VERSION);
      assert.ok(rep.reviews.every((r) => r.revieweeId === sellerId));
      assert.ok(rep.reviews.every((r) => r.reviewerId !== sellerId));

      const empty = await svc.getUserReputation(`nobody-${i}`);
      assert.equal(empty.totalReviewsCount, 0);
      assert.equal(empty.ratingAverage, null);
    });
  }
});

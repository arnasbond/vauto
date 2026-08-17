/**
 * Stage 11J.2 — Real PostgreSQL pg.Pool SELECT … FOR UPDATE concurrency.
 * Requires TEST_DATABASE_URL (CI postgres:16). Skipped locally without it.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  UNIVERSAL_CORE_11J1_MIGRATION_SQL,
  UNIVERSAL_CORE_11J2_MIGRATION_SQL,
  UNIVERSAL_CORE_11J3_MIGRATION_SQL,
  UNIVERSAL_CORE_MIGRATION_SQL,
  wrapClientAsQueryable,
} from "../index.js";
import {
  FinancialCapExceededError,
  createFinancialObligationService,
} from "../../payments/ledger/index.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const describePg = TEST_URL ? describe : describe.skip;

describePg("11J.2 Real PostgreSQL pool FOR UPDATE", () => {
  let pool: pg.Pool;
  let repo: TransactionRepository;
  let n = 0;

  before(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL, max: 5 });
    assert.ok((pool.options.max ?? 0) >= 2);
    const client = await pool.connect();
    try {
      await client.query(TRANSACTION_MIGRATION_SQL);
      await client.query(UNIVERSAL_CORE_MIGRATION_SQL);
      await client.query(UNIVERSAL_CORE_11J1_MIGRATION_SQL);
      await client.query(UNIVERSAL_CORE_11J2_MIGRATION_SQL);
      await client.query(UNIVERSAL_CORE_11J3_MIGRATION_SQL);
    } finally {
      client.release();
    }
    const q = {
      async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params: unknown[] = []
      ) {
        const res = await pool.query(text, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
    };
    repo = new TransactionRepository(q);
  });

  after(async () => {
    await pool?.end();
  });

  function ids(prefix: string) {
    const k = `${prefix}-${++n}-${randomUUID().slice(0, 8)}`;
    return {
      listingId: `L-${k}`,
      buyerId: `buyer-${k}`,
      sellerId: `seller-${k}`,
    };
  }

  it("two pool clients: 2 × 200 € vs 200 € cap — one FOR UPDATE wait, one cap error", async () => {
    const { listingId, buyerId, sellerId } = ids("pg-cap");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      const svcA = createFinancialObligationService(wrapClientAsQueryable(clientA));
      const svcB = createFinancialObligationService(wrapClientAsQueryable(clientB));
      const payload = {
        transactionId: tx.id,
        type: "SERVICE_DEPOSIT" as const,
        amountCents: 20_000,
        payerId: buyerId,
        beneficiaryId: sellerId,
      };
      const settled = await Promise.allSettled([
        svcA.createObligation(payload),
        svcB.createObligation(payload),
      ]);
      const ok = settled.filter((s) => s.status === "fulfilled");
      const bad = settled.filter((s) => s.status === "rejected");
      assert.equal(ok.length, 1);
      assert.equal(bad.length, 1);
      assert.ok(
        bad[0]!.status === "rejected" &&
          bad[0].reason instanceof FinancialCapExceededError
      );
    } finally {
      clientA.release();
      clientB.release();
    }

    const sum = await pool.query<{ s: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0)::text AS s
       FROM vauto_financial_obligations
       WHERE transaction_id = $1 AND type <> 'REFUND'`,
      [tx.id]
    );
    assert.equal(Number(sum.rows[0]!.s), 20_000);
  });

  it("two pool clients: concurrent refund — exactly one refund row", async () => {
    const { listingId, buyerId, sellerId } = ids("pg-ref");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const setup = createFinancialObligationService({
      async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params: unknown[] = []
      ) {
        const res = await pool.query(text, params);
        return { rows: res.rows as T[], rowCount: res.rowCount };
      },
    });
    const held = await setup.createObligation({
      transactionId: tx.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      const svcA = createFinancialObligationService(wrapClientAsQueryable(clientA));
      const svcB = createFinancialObligationService(wrapClientAsQueryable(clientB));
      const payload = {
        transactionId: tx.id,
        sourceObligationId: held.id,
        amountCents: 20_000,
        actorUserId: buyerId,
      };
      const settled = await Promise.allSettled([
        svcA.refundObligation(payload),
        svcB.refundObligation(payload),
      ]);
      const ok = settled.filter((s) => s.status === "fulfilled");
      assert.equal(ok.length, 1);
    } finally {
      clientA.release();
      clientB.release();
    }

    const refunds = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_financial_obligations
       WHERE transaction_id = $1 AND type = 'REFUND'`,
      [tx.id]
    );
    assert.equal(Number(refunds.rows[0]!.c), 1);
  });
});

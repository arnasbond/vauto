/**
 * Stage 11E.2 — Real PostgreSQL pg.Pool payment-readiness gate.
 *
 * When TEST_DATABASE_URL is set (CI postgres:16 service), runs against a real
 * multi-connection Pool (max >= 4). Otherwise falls back to PGlite so local
 * suites stay green without Docker.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  createPoolTxQueryableFromPool,
  type TxQueryable,
} from "../index.js";
import {
  OfferEngine,
  OFFERS_MIGRATION_SQL,
  ListingSaleConflictError,
  OfferVersionConflictError,
  OfferStateError,
} from "../offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import {
  DEAL_ROOM_MIGRATION_SQL,
  getAgreementSnapshotByTransaction,
} from "../../deal-room/index.js";
import { VersionConflictError } from "../types.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const USE_REAL_PG = Boolean(TEST_URL);

const LISTINGS_STUB = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC(12,2),
  location TEXT,
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active'
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
`;

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

describe("11E.2 Real PostgreSQL pg.Pool gate", () => {
  let pool: pg.Pool | null = null;
  let pglite: PGlite | null = null;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-${++seq}-${Date.now()}`;

  async function applyMigrationSql(sql: string): Promise<void> {
    if (pool) {
      // Simple-query (no bind params) allows multi-statement migration scripts.
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
      return;
    }
    await pglite!.exec(sql);
  }

  before(async () => {
    if (USE_REAL_PG) {
      pool = new pg.Pool({
        connectionString: TEST_URL,
        max: 4,
      });
      // Prove multi-connection pool (4 reserved clients simultaneously)
      const clients = await Promise.all([
        pool.connect(),
        pool.connect(),
        pool.connect(),
        pool.connect(),
      ]);
      assert.equal(clients.length, 4);
      for (const c of clients) c.release();

      q = createPoolTxQueryableFromPool(pool) as TxQueryable;
      await applyMigrationSql(TRANSACTION_MIGRATION_SQL);
      await applyMigrationSql(OFFERS_MIGRATION_SQL);
      await applyMigrationSql(TRANSACTION_CHAT_MIGRATION_SQL);
      await applyMigrationSql(DEAL_ROOM_MIGRATION_SQL);
      await applyMigrationSql(LISTINGS_STUB);
    } else {
      pglite = new PGlite();
      await pglite.exec(TRANSACTION_MIGRATION_SQL);
      await pglite.exec(OFFERS_MIGRATION_SQL);
      await pglite.exec(TRANSACTION_CHAT_MIGRATION_SQL);
      await pglite.exec(DEAL_ROOM_MIGRATION_SQL);
      await pglite.exec(LISTINGS_STUB);
      q = adaptPglite(pglite);
    }
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await pool?.end();
    await pglite?.close();
  });

  async function seedListing(id: string, title: string, sellerId = `seller-${id}`) {
    const usersTbl = await q.query<{ t: string | null }>(
      `SELECT to_regclass('public.users')::text AS t`
    );
    if (usersTbl.rows[0]?.t) {
      await q.query(
        `INSERT INTO users (id, name, phone, city)
         VALUES ($1,'11E2 seller','+37060000000','Vilnius')
         ON CONFLICT (id) DO NOTHING`,
        [sellerId]
      );
    }
    await q.query(
      `INSERT INTO listings (id, seller_id, title, price, location, image, attributes, status, category)
       VALUES ($1,$2,$3,999,'LT','https://img.example/pg.jpg','{"gate":"11e2"}'::jsonb,'active','electronics')
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         seller_id = EXCLUDED.seller_id,
         location = EXCLUDED.location,
         image = EXCLUDED.image,
         category = EXCLUDED.category`,
      [id, sellerId, title]
    );
  }

  it(`backend mode: ${USE_REAL_PG ? "REAL pg.Pool max=4" : "PGlite fallback"}`, () => {
    assert.ok(q);
    if (USE_REAL_PG) {
      assert.ok(pool);
      assert.ok((pool as pg.Pool).options.max! >= 4);
    }
  });

  it("MULTI-BUYER concurrent accept: exactly 1 AGREED + snapshot", async () => {
    const listingId = `L-pool-race-${Date.now()}-${seq}`;
    const sellerId = `seller-race-${seq}`;
    await seedListing(listingId, "Race listing", sellerId);
    const txA = await txRepo.create({
      listingId,
      buyerId: `buyer-A-${seq}`,
      sellerId,
      currentPrice: 999,
    });
    const txB = await txRepo.create({
      listingId,
      buyerId: `buyer-B-${seq}`,
      sellerId,
      currentPrice: 999,
    });
    const amountA = 125000;
    const amountB = 130000;
    const oA = await offers.create({
      transactionId: txA.id,
      actorUserId: txA.buyerId,
      amountCents: amountA,
      idempotencyKey: key("race-a"),
    });
    const oB = await offers.create({
      transactionId: txB.id,
      actorUserId: txB.buyerId,
      amountCents: amountB,
      idempotencyKey: key("race-b"),
    });

    const results = await Promise.allSettled([
      offers.accept({
        offerId: oA.offer.id,
        actorUserId: sellerId,
        idempotencyKey: key("race-acc-a"),
        expectedVersion: oA.offer.version,
      }),
      offers.accept({
        offerId: oB.offer.id,
        actorUserId: sellerId,
        idempotencyKey: key("race-acc-b"),
        expectedVersion: oB.offer.version,
      }),
    ]);

    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected");
    assert.equal(wins.length, 1, `expected 1 win, got ${wins.length}`);
    assert.equal(losses.length, 1, `expected 1 loss, got ${losses.length}`);

    const loss = losses[0]!;
    assert.equal(loss.status, "rejected");
    const err = loss.reason;
    assert.ok(
      err instanceof ListingSaleConflictError ||
        err instanceof OfferVersionConflictError ||
        err instanceof VersionConflictError ||
        err instanceof OfferStateError,
      `unexpected loser error: ${err}`
    );

    const win = (wins[0] as PromiseFulfilledResult<{
      transaction: { id: string; status: string };
      offer: { id: string; amountCents: number; status: string };
    }>).value;
    assert.equal(win.transaction.status, "AGREED");
    assert.equal(win.offer.status, "ACCEPTED");
    assert.ok(Number.isInteger(win.offer.amountCents));

    const snap = await getAgreementSnapshotByTransaction(q, win.transaction.id);
    assert.ok(snap, "winner must have deal snapshot");
    assert.equal(snap!.acceptedOfferId, win.offer.id);
    assert.equal(snap!.amountCents, win.offer.amountCents);
    assert.ok(Number.isInteger(snap!.amountCents));

    const agreedCount = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_transactions
       WHERE listing_id = $1 AND status = 'AGREED'`,
      [listingId]
    );
    assert.equal(Number(agreedCount.rows[0]?.c), 1);

    const snapCount = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_deal_snapshots
       WHERE listing_id = $1`,
      [listingId]
    );
    assert.equal(Number(snapCount.rows[0]?.c), 1);
  });

  it("FAIL-CLOSED snapshot error rolls back entire accept TX", async () => {
    const listingId = `L-fail-snap-${Date.now()}-${seq}`;
    const buyerId = `buyer-fs-${seq}`;
    const sellerId = `seller-fs-${seq}`;
    await seedListing(listingId, "Will delete", sellerId);
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 500,
    });
    const amountCents = 77777;
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents,
      idempotencyKey: key("fs-c"),
    });
    assert.equal(created.transaction.status, "OFFER_PENDING");

    // Remove listing so ensureAgreementSnapshot fail-closes
    await q.query(`DELETE FROM listings WHERE id = $1`, [listingId]);

    await assert.rejects(
      () =>
        offers.accept({
          offerId: created.offer.id,
          actorUserId: sellerId,
          idempotencyKey: key("fs-a"),
          expectedVersion: created.offer.version,
        }),
      (e: unknown) =>
        e instanceof Error &&
        /fail-closed|listing not found|cannot load listing/i.test(e.message)
    );

    const liveTx = await txRepo.getById(tx.id);
    assert.equal(liveTx!.status, "OFFER_PENDING");
    const liveOffer = await offers.get(created.offer.id);
    assert.equal(liveOffer!.status, "PENDING");
    assert.equal(liveOffer!.amountCents, amountCents);

    const snaps = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_deal_snapshots WHERE transaction_id = $1`,
      [tx.id]
    );
    assert.equal(Number(snaps.rows[0]?.c), 0);

    const acceptedOffers = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_offers
       WHERE transaction_id = $1 AND status = 'ACCEPTED'`,
      [tx.id]
    );
    assert.equal(Number(acceptedOffers.rows[0]?.c), 0);
  });

  it("AUDIT IMMUTABILITY: UPDATE/DELETE raise append-only exception", async () => {
    const listingId = `L-audit-${Date.now()}-${seq}`;
    const buyerId = `buyer-au-${seq}`;
    const sellerId = `seller-au-${seq}`;
    await seedListing(listingId, "Audit listing", sellerId);
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
    });
    await txRepo.executeTransition({
      transactionId: tx.id,
      expectedVersion: 0,
      toStatus: "OFFER_PENDING",
      actorType: "BUYER",
      actorId: buyerId,
      idempotencyKey: key("au-sm"),
      reasonCode: "OFFER_SUBMITTED",
    });
    const audit = await q.query<{ id: string }>(
      `SELECT id FROM vauto_transaction_audit WHERE transaction_id = $1 LIMIT 1`,
      [tx.id]
    );
    assert.ok(audit.rows[0]?.id);

    await assert.rejects(
      () =>
        q.query(
          `UPDATE vauto_transaction_audit SET state_hash = 'tampered' WHERE id = $1`,
          [audit.rows[0]!.id]
        ),
      (e: unknown) =>
        e instanceof Error &&
        /append-only|Audit records are append-only/i.test(e.message)
    );

    await assert.rejects(
      () =>
        q.query(`DELETE FROM vauto_transaction_audit WHERE id = $1`, [
          audit.rows[0]!.id,
        ]),
      (e: unknown) =>
        e instanceof Error &&
        /append-only|Audit records are append-only/i.test(e.message)
    );
  });

  it("AMOUNT CENTS financial authority: snapshot + accepted offer INT", async () => {
    const listingId = `L-cents-${Date.now()}-${seq}`;
    const buyerId = `buyer-cents-${seq}`;
    const sellerId = `seller-cents-${seq}`;
    await seedListing(listingId, "Cents listing", sellerId);
    const amountCents = 199999;
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 2000.5, // UI euro — must NOT become financial authority
    });
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents,
      idempotencyKey: key("cents-c"),
    });
    const accepted = await offers.accept({
      offerId: created.offer.id,
      actorUserId: sellerId,
      idempotencyKey: key("cents-a"),
      expectedVersion: created.offer.version,
    });
    assert.equal(accepted.offer.amountCents, amountCents);
    assert.equal(Number.isInteger(accepted.offer.amountCents), true);

    const snap = await getAgreementSnapshotByTransaction(q, accepted.transaction.id);
    assert.ok(snap);
    assert.equal(snap!.amountCents, amountCents);
    assert.equal(Number.isInteger(snap!.amountCents), true);
    assert.equal(snap!.acceptedOfferId, accepted.offer.id);

    const col = await q.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'vauto_deal_snapshots' AND column_name = 'amount_cents'`
    );
    if (col.rows[0]) {
      assert.ok(
        /integer|bigint|smallint/i.test(col.rows[0].data_type),
        `amount_cents type=${col.rows[0].data_type}`
      );
    }
  });
});

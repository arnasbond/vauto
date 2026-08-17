/**
 * Stage 13C.1 — real PostgreSQL concurrency (Tests S / T / U).
 *
 * Requires TEST_DATABASE_URL and pg.Pool({ max: >= 2 }) with two independent
 * connections. PGlite is NOT a substitute here.
 *
 * If env is missing:
 * SKIPPED — requires TEST_DATABASE_URL; mandatory before Stage 14 GO/NO-GO.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  createPoolTxQueryableFromPool,
  type TxQueryable,
} from "../../transaction/index.js";
import { OFFERS_MIGRATION_SQL, OfferEngine } from "../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../deal-room/index.js";
import { createUniversalDealRoomService } from "../universal-deal-room-service.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const SKIP_MSG =
  "SKIPPED — requires TEST_DATABASE_URL; mandatory before Stage 14 GO/NO-GO.";
const describePg = TEST_URL ? describe : describe.skip;

const LISTINGS_SQL = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  seller_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC(12,2),
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  category TEXT,
  status TEXT DEFAULT 'active'
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image TEXT;
`;

describePg("Stage 13C.1 real PostgreSQL concurrency", () => {
  let pool: pg.Pool | undefined;
  let q: TxQueryable;
  let qA: TxQueryable;
  let qB: TxQueryable;
  let txRepo: TransactionRepository;
  let seq = 0;

  const idem = (p: string) => `${p}-${++seq}-${randomUUID().slice(0, 8)}`;

  before(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL, max: 4 });
    assert.ok((pool.options.max ?? 0) >= 2);
    const reserved = await Promise.all([pool.connect(), pool.connect()]);
    assert.equal(reserved.length, 2);
    for (const c of reserved) c.release();

    const client = await pool.connect();
    try {
      await client.query(TRANSACTION_MIGRATION_SQL);
      await client.query(OFFERS_MIGRATION_SQL);
      await client.query(TRANSACTION_CHAT_MIGRATION_SQL);
      await client.query(DEAL_ROOM_MIGRATION_SQL);
      await client.query(LISTINGS_SQL);
    } finally {
      client.release();
    }

    q = createPoolTxQueryableFromPool(pool) as TxQueryable;
    qA = createPoolTxQueryableFromPool(pool) as TxQueryable;
    qB = createPoolTxQueryableFromPool(pool) as TxQueryable;
    txRepo = new TransactionRepository(q);
  });

  after(async () => {
    await pool?.end();
  });

  async function openDeal(prefix: string) {
    const listingId = `${prefix}-${randomUUID().slice(0, 8)}`;
    const buyerId = `buyer-${listingId}`;
    const sellerId = `seller-${listingId}`;
    const usersTbl = await q.query<{ t: string | null }>(
      `SELECT to_regclass('public.users')::text AS t`
    );
    if (usersTbl.rows[0]?.t) {
      await q.query(
        `INSERT INTO users (id, name, phone, city)
         VALUES ($1,'13C seller','+37060000000','Vilnius')
         ON CONFLICT (id) DO NOTHING`,
        [sellerId]
      );
    }
    await q.query(
      `INSERT INTO listings (id, seller_id, title, price, location, image, attributes, category, status)
       VALUES ($1,$2,$3,1000,'LT','https://img.example/13c1.jpg',$4::jsonb,'electronics','active')
       ON CONFLICT (id) DO UPDATE SET
         seller_id = EXCLUDED.seller_id,
         attributes = EXCLUDED.attributes,
         category = EXCLUDED.category,
         location = EXCLUDED.location,
         image = EXCLUDED.image`,
      [
        listingId,
        sellerId,
        `PG ${listingId}`,
        JSON.stringify({ _canonicalVertical: "ELECTRONICS" }),
      ]
    );
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: null,
    });
    return { tx, buyerId, sellerId, listingId };
  }

  it("S — double ACCEPT: one authoritative transition, one conflict", async () => {
    const { tx, buyerId, sellerId } = await openDeal("13c1-S");
    const setup = createUniversalDealRoomService(q);
    const created = await setup.createOffer({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: 50000,
      idempotencyKey: idem("s-o"),
    });
    const svcA = createUniversalDealRoomService(qA);
    const svcB = createUniversalDealRoomService(qB);
    const results = await Promise.allSettled([
      svcA.acceptOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("s-a"),
      }),
      svcB.acceptOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("s-b"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    const live = await txRepo.getById(tx.id);
    assert.equal(live!.status, "AGREED");
    const accepted = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_offers
       WHERE transaction_id = $1 AND status = 'ACCEPTED'`,
      [tx.id]
    );
    assert.equal(Number(accepted.rows[0]?.c), 1);
    const pending = await q.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM vauto_offers
       WHERE transaction_id = $1 AND status = 'PENDING'`,
      [tx.id]
    );
    assert.equal(Number(pending.rows[0]?.c), 0);
  });

  it("T — ACCEPT vs REJECT: one terminal DB state", async () => {
    const { tx, buyerId, sellerId } = await openDeal("13c1-T");
    const setup = createUniversalDealRoomService(q);
    const created = await setup.createOffer({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: 41000,
      idempotencyKey: idem("t-o"),
    });
    const svcA = createUniversalDealRoomService(qA);
    const svcB = createUniversalDealRoomService(qB);
    const results = await Promise.allSettled([
      svcA.acceptOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("t-acc"),
      }),
      svcB.rejectOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("t-rej"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    const offer = await new OfferEngine(q).get(created.offer.id);
    assert.ok(offer!.status === "ACCEPTED" || offer!.status === "REJECTED");
    const terminal = await q.query<{ status: string; c: string }>(
      `SELECT status, COUNT(*)::text AS c FROM vauto_offers
       WHERE transaction_id = $1 AND status IN ('ACCEPTED','REJECTED')
       GROUP BY status`,
      [tx.id]
    );
    assert.equal(terminal.rows.length, 1);
    const live = await txRepo.getById(tx.id);
    if (offer!.status === "ACCEPTED") {
      assert.equal(live!.status, "AGREED");
    } else {
      assert.notEqual(live!.status, "AGREED");
    }
  });

  it("U — parallel counters: one revision chain, one current PENDING", async () => {
    const idx = await q.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE indexname = 'uq_vauto_offers_active_pending_per_tx'`
    );
    assert.equal(idx.rows[0]?.indexname, "uq_vauto_offers_active_pending_per_tx");

    const { tx, buyerId, sellerId } = await openDeal("13c1-U");
    const setup = createUniversalDealRoomService(q);
    const created = await setup.createOffer({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: 30000,
      idempotencyKey: idem("u-o"),
    });
    const svcA = createUniversalDealRoomService(qA);
    const svcB = createUniversalDealRoomService(qB);
    const results = await Promise.allSettled([
      svcA.counterOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        amountCents: 31000,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("u-c1"),
      }),
      svcB.counterOffer({
        offerId: created.offer.id,
        actorUserId: sellerId,
        amountCents: 32000,
        expectedVersion: created.offer.version,
        idempotencyKey: idem("u-c2"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    const pending = await q.query<{
      id: string;
      parent_offer_id: string | null;
      status: string;
    }>(
      `SELECT id, parent_offer_id, status FROM vauto_offers
       WHERE transaction_id = $1 AND status = 'PENDING'`,
      [tx.id]
    );
    assert.equal(pending.rows.length, 1);
    assert.equal(pending.rows[0]?.parent_offer_id, created.offer.id);
    const parent = await new OfferEngine(q).get(created.offer.id);
    assert.equal(parent!.status, "COUNTERED");
    assert.equal(parent!.amountCents, 30000);
  });
});

if (!TEST_URL) {
  it.skip(SKIP_MSG, () => {
    /* registered so SKIP is visible and is not reported as PASS */
  });
}

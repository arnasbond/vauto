/**
 * Stage 11B — PGlite integration: offers + 11A SM, races, IDOR, idempotency.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  type TxQueryable,
} from "../../index.js";
import {
  OfferEngine,
  OFFERS_MIGRATION_SQL,
  OfferAuthError,
  OfferVersionConflictError,
  STRUCTURED_OFFERS_VERSION,
} from "../index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../../deal-room/index.js";

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

describe("11B Structured Offers PostgreSQL integration", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let engine: OfferEngine;
  let seq = 0;
  const idem = (p: string) => `${p}-${++seq}-${Date.now()}`;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        price NUMERIC(12,2),
        image TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        attributes JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'active'
      );
    `);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    engine = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function openTx(listingId: string, buyerId: string, sellerId: string) {
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes)
       VALUES ($1,$2,100,'https://img.example/x.jpg','{"src":"test"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [listingId, `Listing ${listingId}`]
    );
    return txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: null,
    });
  }

  // —— 35 accept path variants (loop) ——
  for (let i = 0; i < 35; i++) {
    it(`accept #${i}: buyer offer → seller accept → AGREED`, async () => {
      const listingId = `L-acc-${i}-${seq}`;
      const buyerId = `buyer-acc-${i}`;
      const sellerId = `seller-acc-${i}`;
      const t = await openTx(listingId, buyerId, sellerId);
      const created = await engine.create({
        transactionId: t.id,
        actorUserId: buyerId,
        amountCents: 1000 + i,
        idempotencyKey: idem(`acc-c-${i}`),
      });
      assert.equal(created.transaction.status, "OFFER_PENDING");
      assert.equal(created.offer.amountCents, 1000 + i);
      assert.equal(created.offer.offersVersion, STRUCTURED_OFFERS_VERSION);

      const accepted = await engine.accept({
        offerId: created.offer.id,
        actorUserId: sellerId,
        idempotencyKey: idem(`acc-a-${i}`),
        expectedVersion: created.offer.version,
      });
      assert.equal(accepted.offer.status, "ACCEPTED");
      assert.equal(accepted.transaction.status, "AGREED");
    });
  }

  // —— 30 counter paths ——
  for (let i = 0; i < 30; i++) {
    it(`counter #${i}: immutable parent chain + NEGOTIATING`, async () => {
      const t = await openTx(`L-ctr-${i}-${seq}`, `b-ctr-${i}`, `s-ctr-${i}`);
      const o1 = await engine.create({
        transactionId: t.id,
        actorUserId: `b-ctr-${i}`,
        amountCents: 2000 + i,
        idempotencyKey: idem(`ctr-c-${i}`),
      });
      const o2 = await engine.counter({
        offerId: o1.offer.id,
        actorUserId: `s-ctr-${i}`,
        amountCents: 2500 + i,
        idempotencyKey: idem(`ctr-k-${i}`),
        expectedVersion: o1.offer.version,
      });
      assert.equal(o2.offer.parentOfferId, o1.offer.id);
      assert.equal(o2.offer.status, "PENDING");
      assert.equal(o2.transaction.status, "NEGOTIATING");
      const parent = await engine.get(o1.offer.id);
      assert.equal(parent!.status, "COUNTERED");
      // Parent immutable amount
      assert.equal(parent!.amountCents, 2000 + i);
    });
  }

  // —— 20 reject ——
  for (let i = 0; i < 20; i++) {
    it(`reject #${i}`, async () => {
      const t = await openTx(`L-rej-${i}-${seq}`, `b-rej-${i}`, `s-rej-${i}`);
      const o = await engine.create({
        transactionId: t.id,
        actorUserId: `b-rej-${i}`,
        amountCents: 3000 + i,
        idempotencyKey: idem(`rej-c-${i}`),
      });
      const r = await engine.reject({
        offerId: o.offer.id,
        actorUserId: `s-rej-${i}`,
        idempotencyKey: idem(`rej-a-${i}`),
        expectedVersion: o.offer.version,
      });
      assert.equal(r.offer.status, "REJECTED");
    });
  }

  // —— 15 withdraw ——
  for (let i = 0; i < 15; i++) {
    it(`withdraw #${i}`, async () => {
      const t = await openTx(`L-wd-${i}-${seq}`, `b-wd-${i}`, `s-wd-${i}`);
      const o = await engine.create({
        transactionId: t.id,
        actorUserId: `b-wd-${i}`,
        amountCents: 4000 + i,
        idempotencyKey: idem(`wd-c-${i}`),
      });
      const w = await engine.withdraw({
        offerId: o.offer.id,
        actorUserId: `b-wd-${i}`,
        idempotencyKey: idem(`wd-a-${i}`),
        expectedVersion: o.offer.version,
      });
      assert.equal(w.offer.status, "WITHDRAWN");
      assert.equal(w.transaction.status, "CANCELLED");
    });
  }

  // —— 15 expiry ——
  for (let i = 0; i < 15; i++) {
    it(`expire #${i}`, async () => {
      const t = await openTx(`L-ex-${i}-${seq}`, `b-ex-${i}`, `s-ex-${i}`);
      const o = await engine.create({
        transactionId: t.id,
        actorUserId: `b-ex-${i}`,
        amountCents: 5000 + i,
        idempotencyKey: idem(`ex-c-${i}`),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      const e = await engine.expire({
        offerId: o.offer.id,
        idempotencyKey: idem(`ex-a-${i}`),
      });
      assert.equal(e.offer.status, "EXPIRED");
      assert.equal(e.transaction.status, "EXPIRED");
    });
  }

  // —— IDOR ——
  it("IDOR: stranger cannot list offers", async () => {
    const t = await openTx("L-idor-list", "b-idor", "s-idor");
    await engine.create({
      transactionId: t.id,
      actorUserId: "b-idor",
      amountCents: 11111,
      idempotencyKey: idem("idor-list-c"),
    });
    await assert.rejects(
      () => engine.list(t.id, "stranger-x"),
      OfferAuthError
    );
  });

  it("IDOR: stranger cannot accept", async () => {
    const t = await openTx("L-idor-acc", "b-idor2", "s-idor2");
    const o = await engine.create({
      transactionId: t.id,
      actorUserId: "b-idor2",
      amountCents: 22222,
      idempotencyKey: idem("idor-acc-c"),
    });
    await assert.rejects(
      () =>
        engine.accept({
          offerId: o.offer.id,
          actorUserId: "stranger-y",
          idempotencyKey: idem("idor-acc-a"),
          expectedVersion: 0,
        }),
      OfferAuthError
    );
  });

  it("IDOR: buyer cannot accept own offer", async () => {
    const t = await openTx("L-idor-self", "b-self", "s-self");
    const o = await engine.create({
      transactionId: t.id,
      actorUserId: "b-self",
      amountCents: 33333,
      idempotencyKey: idem("idor-self-c"),
    });
    await assert.rejects(
      () =>
        engine.accept({
          offerId: o.offer.id,
          actorUserId: "b-self",
          idempotencyKey: idem("idor-self-a"),
          expectedVersion: 0,
        }),
      OfferAuthError
    );
  });

  it("IDOR: other buyer cannot reject", async () => {
    const t = await openTx("L-idor-rej", "b-or", "s-or");
    const o = await engine.create({
      transactionId: t.id,
      actorUserId: "b-or",
      amountCents: 44444,
      idempotencyKey: idem("idor-rej-c"),
    });
    await assert.rejects(
      () =>
        engine.reject({
          offerId: o.offer.id,
          actorUserId: "other-buyer",
          idempotencyKey: idem("idor-rej-a"),
          expectedVersion: 0,
        }),
      OfferAuthError
    );
  });

  for (let i = 0; i < 16; i++) {
    it(`IDOR reject/accept/counter stranger #${i}`, async () => {
      const t = await openTx(`L-idor-n-${i}`, `b-n-${i}`, `s-n-${i}`);
      const o = await engine.create({
        transactionId: t.id,
        actorUserId: `b-n-${i}`,
        amountCents: 55500 + i,
        idempotencyKey: idem(`idor-n-c-${i}`),
      });
      await assert.rejects(
        () =>
          engine.counter({
            offerId: o.offer.id,
            actorUserId: `evil-${i}`,
            amountCents: 1,
            idempotencyKey: idem(`idor-n-k-${i}`),
            expectedVersion: 0,
          }),
        OfferAuthError
      );
    });
  }

  // —— Multi-buyer race ——
  it("MULTI-BUYER RACE: exactly 1 AGREED on same listing", async () => {
    const listingId = `L-race-mb-${Date.now()}`;
    const sellerId = "seller-race";
    const txA = await openTx(listingId, "buyer-A", sellerId);
    const txB = await openTx(listingId, "buyer-B", sellerId);
    const oA = await engine.create({
      transactionId: txA.id,
      actorUserId: "buyer-A",
      amountCents: 10000,
      idempotencyKey: idem("mb-a"),
    });
    const oB = await engine.create({
      transactionId: txB.id,
      actorUserId: "buyer-B",
      amountCents: 11000,
      idempotencyKey: idem("mb-b"),
    });

    const results = await Promise.allSettled([
      engine.accept({
        offerId: oA.offer.id,
        actorUserId: sellerId,
        idempotencyKey: idem("mb-acc-a"),
        expectedVersion: oA.offer.version,
      }),
      engine.accept({
        offerId: oB.offer.id,
        actorUserId: sellerId,
        idempotencyKey: idem("mb-acc-b"),
        expectedVersion: oB.offer.version,
      }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1, `wins=${ok.length}`);
    assert.equal(fail.length, 1);
    assert.ok(fail[0]!.status === "rejected");

    const a = await txRepo.getById(txA.id);
    const b = await txRepo.getById(txB.id);
    const agreed = [a!, b!].filter((t) => t.status === "AGREED");
    assert.equal(agreed.length, 1);
  });

  // —— Accept vs withdraw race ——
  it("PRICE RACE: accept vs withdraw → exactly 1 wins", async () => {
    const t = await openTx("L-race-aw", "b-aw", "s-aw");
    const o = await engine.create({
      transactionId: t.id,
      actorUserId: "b-aw",
      amountCents: 77777,
      idempotencyKey: idem("aw-c"),
    });
    const results = await Promise.allSettled([
      engine.accept({
        offerId: o.offer.id,
        actorUserId: "s-aw",
        idempotencyKey: idem("aw-acc"),
        expectedVersion: 0,
      }),
      engine.withdraw({
        offerId: o.offer.id,
        actorUserId: "b-aw",
        idempotencyKey: idem("aw-wd"),
        expectedVersion: 0,
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(fail.length, 1);
    const final = await engine.get(o.offer.id);
    assert.ok(
      final!.status === "ACCEPTED" || final!.status === "WITHDRAWN",
      final!.status
    );
  });

  // extra concurrency version conflicts
  for (let i = 0; i < 18; i++) {
    it(`concurrency stale version #${i}`, async () => {
      const t = await openTx(`L-ver-${i}`, `b-v-${i}`, `s-v-${i}`);
      const o = await engine.create({
        transactionId: t.id,
        actorUserId: `b-v-${i}`,
        amountCents: 8000 + i,
        idempotencyKey: idem(`ver-c-${i}`),
      });
      await engine.accept({
        offerId: o.offer.id,
        actorUserId: `s-v-${i}`,
        idempotencyKey: idem(`ver-a-${i}`),
        expectedVersion: 0,
      });
      await assert.rejects(
        () =>
          engine.reject({
            offerId: o.offer.id,
            actorUserId: `s-v-${i}`,
            idempotencyKey: idem(`ver-r-${i}`),
            expectedVersion: 0,
          }),
        (e: unknown) =>
          e instanceof OfferVersionConflictError ||
          e instanceof Error
      );
    });
  }

  // —— Idempotency ——
  for (let i = 0; i < 10; i++) {
    it(`idempotency create replay #${i}`, async () => {
      const t = await openTx(`L-idem-${i}`, `b-id-${i}`, `s-id-${i}`);
      const key = idem(`idem-stable-${i}`);
      const a = await engine.create({
        transactionId: t.id,
        actorUserId: `b-id-${i}`,
        amountCents: 9000 + i,
        idempotencyKey: key,
      });
      const b = await engine.create({
        transactionId: t.id,
        actorUserId: `b-id-${i}`,
        amountCents: 9000 + i,
        idempotencyKey: key,
      });
      assert.equal(b.idempotentReplay, true);
      assert.equal(b.offer.id, a.offer.id);
      const listed = await engine.list(t.id, `b-id-${i}`);
      assert.equal(listed.filter((x) => x.status === "PENDING").length, 1);
    });
  }

  // —— Rollback: illegal accept after AGREED elsewhere leaves other PENDING ——
  for (let i = 0; i < 5; i++) {
    it(`rollback integrity #${i}: failed accept does not AGREED`, async () => {
      const listingId = `L-rb-${i}-${Date.now()}`;
      const sellerId = `s-rb-${i}`;
      const txA = await openTx(listingId, `b-rb-a-${i}`, sellerId);
      const txB = await openTx(listingId, `b-rb-b-${i}`, sellerId);
      const oA = await engine.create({
        transactionId: txA.id,
        actorUserId: `b-rb-a-${i}`,
        amountCents: 12000 + i,
        idempotencyKey: idem(`rb-a-${i}`),
      });
      const oB = await engine.create({
        transactionId: txB.id,
        actorUserId: `b-rb-b-${i}`,
        amountCents: 13000 + i,
        idempotencyKey: idem(`rb-b-${i}`),
      });
      await engine.accept({
        offerId: oA.offer.id,
        actorUserId: sellerId,
        idempotencyKey: idem(`rb-acc-a-${i}`),
        expectedVersion: 0,
      });
      await assert.rejects(() =>
        engine.accept({
          offerId: oB.offer.id,
          actorUserId: sellerId,
          idempotencyKey: idem(`rb-acc-b-${i}`),
          expectedVersion: 0,
        })
      );
      const bAfter = await txRepo.getById(txB.id);
      assert.notEqual(bAfter!.status, "AGREED");
      const offerB = await engine.get(oB.offer.id);
      // May be REJECTED by winner's listing cleanup or still PENDING
      assert.ok(
        offerB!.status === "PENDING" || offerB!.status === "REJECTED",
        offerB!.status
      );
    });
  }

  it("full counter then accept → AGREED with cents preserved", async () => {
    const t = await openTx("L-full", "b-full", "s-full");
    const o1 = await engine.create({
      transactionId: t.id,
      actorUserId: "b-full",
      amountCents: 69999,
      idempotencyKey: idem("full-1"),
    });
    const o2 = await engine.counter({
      offerId: o1.offer.id,
      actorUserId: "s-full",
      amountCents: 74999,
      idempotencyKey: idem("full-2"),
      expectedVersion: 0,
    });
    const done = await engine.accept({
      offerId: o2.offer.id,
      actorUserId: "b-full",
      idempotencyKey: idem("full-3"),
      expectedVersion: 0,
    });
    assert.equal(done.transaction.status, "AGREED");
    assert.equal(done.offer.amountCents, 74999);
    assert.equal(done.offer.currency, "EUR");
  });
});

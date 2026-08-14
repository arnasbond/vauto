/**
 * Stage 11E — Deal Room 1.0 tests (read model, snapshots, IDOR, stale).
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  OFFERS_MIGRATION_SQL,
  OfferEngine,
} from "../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import {
  DEAL_ROOM_VERSION,
  DEAL_ROOM_MIGRATION_SQL,
  createDealRoomService,
  computeDealRoomAllowedActions,
  adaptTimelinePreview,
  computeSnapshotHash,
  getAgreementSnapshotByTransaction,
  DealRoomAuthError,
  DealRoomNotFoundError,
  DealRoomVersionConflictError,
  DealRoomResponseSchema,
} from "../index.js";

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

const LISTINGS_STUB = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC(12,2),
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active'
);
`;

describe("11E Deal Room", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-idem-${++seq}-${Date.now()}`;

  const participants = {
    async loadParticipant(userId: string) {
      return {
        displayName: userId.startsWith("buyer") ? "Pirkėjas X" : "Pardavėjas Y",
        avatarUrl: null,
        verified: userId.includes("ver"),
      };
    },
  };

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(LISTINGS_STUB);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function seedListing(
    id: string,
    title: string,
    priceEuro: number,
    attrs: Record<string, unknown> = { color: "juoda" }
  ) {
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes, status)
       VALUES ($1,$2,$3,'https://img.example/a.jpg',$4::jsonb,'active')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price, attributes = EXCLUDED.attributes`,
      [id, title, priceEuro, JSON.stringify(attrs)]
    );
  }

  async function setupPending(tag: string, offerCents = 90000, ask = 1000) {
    const listingId = `L-${tag}`;
    await seedListing(listingId, `Skelbimas ${tag}`, ask, { tag });
    const buyerId = `buyer-${tag}`;
    const sellerId = `seller-${tag}`;
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: ask,
    });
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: offerCents,
      idempotencyKey: key(`c-${tag}`),
    });
    const svc = createDealRoomService(q, { participants });
    return {
      tx,
      buyerId,
      sellerId,
      offer: created.offer,
      svc,
      listingId,
    };
  }

  async function setupAgreed(tag: string, offerCents = 95000, ask = 1100) {
    const ctx = await setupPending(tag, offerCents, ask);
    const live = (await txRepo.getById(ctx.tx.id))!;
    const accepted = await offers.accept({
      offerId: ctx.offer.id,
      actorUserId: ctx.sellerId,
      idempotencyKey: key(`a-${tag}`),
      expectedVersion: ctx.offer.version,
    });
    return { ...ctx, tx: accepted.transaction, offer: accepted.offer, liveBefore: live };
  }

  it("exports dealRoomVersion 1.0", () => {
    assert.equal(DEAL_ROOM_VERSION, "1.0");
  });

  // —— 35 loader / read-model ——
  for (let i = 0; i < 35; i++) {
    it(`loader read-model #${i}`, async () => {
      const { tx, buyerId, svc, offer } = await setupPending(`lr-${i}`, 80000 + i * 100);
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
      });
      assert.equal(room.dealRoomVersion, "1.0");
      assert.equal(room.transaction.id, tx.id);
      assert.ok(["OFFER_PENDING", "DISCUSSION", "NEGOTIATING"].includes(room.transaction.state));
      assert.equal(room.viewerRole, "BUYER");
      assert.equal(room.activeOffer?.amountCents, offer.amountCents);
      assert.equal(room.transactionSummary.paymentStatus, "NOT_AVAILABLE");
      assert.equal(room.transactionSummary.shippingStatus, "NOT_AVAILABLE");
      assert.equal(room.transactionSummary.protectionStatus, "NOT_AVAILABLE");
      assert.ok(!room.allowedActions.includes("PAY" as never));
      DealRoomResponseSchema.parse(room);
    });
  }

  // —— 25 allowed actions ——
  for (let i = 0; i < 25; i++) {
    it(`allowed actions deterministic #${i}`, async () => {
      const sellerView = i % 2 === 0;
      const { tx, buyerId, sellerId, svc } = await setupPending(`aa-${i}`, 85000);
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: sellerView ? sellerId : buyerId,
      });
      if (sellerView) {
        assert.ok(room.allowedActions.includes("ACCEPT_OFFER"));
        assert.ok(room.allowedActions.includes("REJECT_OFFER"));
        assert.ok(!room.allowedActions.includes("WITHDRAW_OFFER"));
      } else {
        assert.ok(room.allowedActions.includes("WITHDRAW_OFFER"));
        assert.ok(!room.allowedActions.includes("ACCEPT_OFFER"));
      }
      assert.ok(room.allowedActions.includes("SEND_MESSAGE"));
      assert.ok(room.allowedActions.includes("OPEN_COPILOT"));
      const pure = computeDealRoomAllowedActions({
        viewerRole: sellerView ? "SELLER" : "BUYER",
        transactionStatus: room.transaction.state,
        activeOffer: room.activeOffer
          ? {
              status: room.activeOffer.status,
              createdByRole: room.activeOffer.createdByRole,
            }
          : null,
      });
      assert.deepEqual([...room.allowedActions].sort(), [...pure].sort());
    });
  }

  // —— 25 auth & IDOR ——
  for (let i = 0; i < 25; i++) {
    it(`auth IDOR stranger 404 #${i}`, async () => {
      const { tx, svc } = await setupPending(`idor-${i}`);
      await assert.rejects(
        () =>
          svc.getDealRoom({
            transactionId: tx.id,
            actorUserId: `stranger-${i}`,
          }),
        (e: unknown) =>
          e instanceof DealRoomAuthError || e instanceof DealRoomNotFoundError
      );
      await assert.rejects(
        () =>
          svc.getDealRoom({
            transactionId: `missing-${i}`,
            actorUserId: `buyer-idor-${i}`,
          }),
        DealRoomNotFoundError
      );
    });
  }

  // —— 20 AGREED + snapshot create ——
  for (let i = 0; i < 20; i++) {
    it(`AGREED creates immutable snapshot #${i}`, async () => {
      const cents = 90000 + i * 250;
      const { tx, buyerId, svc, offer } = await setupAgreed(`ag-${i}`, cents, 1200);
      assert.equal(tx.status, "AGREED");
      const snap = await getAgreementSnapshotByTransaction(q, tx.id);
      assert.ok(snap);
      assert.equal(snap!.amountCents, cents);
      assert.equal(snap!.acceptedOfferId, offer.id);
      assert.equal(snap!.currency, "EUR");
      assert.ok(snap!.snapshotHash.length >= 32);
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
      });
      assert.ok(room.agreementSnapshot);
      assert.equal(room.agreementSnapshot!.amountCents, cents);
      assert.equal(room.transactionSummary.paymentStatus, "NOT_AVAILABLE");
      assert.ok(!room.allowedActions.includes("ACCEPT_OFFER"));
      // UPDATE forbidden
      await assert.rejects(() =>
        q.query(`UPDATE vauto_deal_snapshots SET amount_cents = 1 WHERE id = $1`, [
          snap!.id,
        ])
      );
      // DELETE forbidden
      await assert.rejects(() =>
        q.query(`DELETE FROM vauto_deal_snapshots WHERE id = $1`, [snap!.id])
      );
    });
  }

  // —— 20 listing price change does not alter snapshot ——
  for (let i = 0; i < 20; i++) {
    it(`listing mutate after AGREED keeps snapshot #${i}`, async () => {
      const cents = 88000 + i * 100;
      const { tx, buyerId, sellerId, svc, listingId } = await setupAgreed(
        `mut-${i}`,
        cents,
        1000
      );
      const before = await getAgreementSnapshotByTransaction(q, tx.id);
      assert.equal(before!.amountCents, cents);
      const frozenTitle = before!.listingTitle;
      const frozenHash = before!.snapshotHash;

      await q.query(
        `UPDATE listings SET price = $1, title = $2, attributes = $3::jsonb WHERE id = $4`,
        [1, `HACKED-${i}`, JSON.stringify({ hacked: true }), listingId]
      );

      const after = await getAgreementSnapshotByTransaction(q, tx.id);
      assert.equal(after!.amountCents, cents);
      assert.equal(after!.listingTitle, frozenTitle);
      assert.equal(after!.snapshotHash, frozenHash);
      assert.deepEqual(after!.listingAttributesJson, before!.listingAttributesJson);

      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: sellerId,
      });
      assert.equal(room.agreementSnapshot!.amountCents, cents);
      assert.equal(room.agreementSnapshot!.listingTitle, frozenTitle);
      // live listing card may show new price — snapshot must not
      assert.notEqual(room.agreementSnapshot!.amountCents, 100);
      void buyerId;
    });
  }

  // —— 20 stale version ——
  for (let i = 0; i < 20; i++) {
    it(`stale version conflict #${i}`, async () => {
      const { tx, buyerId, offer, svc } = await setupPending(`st-${i}`);
      const live = (await txRepo.getById(tx.id))!;
      await assert.rejects(
        () =>
          svc.getDealRoom({
            transactionId: tx.id,
            actorUserId: buyerId,
            query: { expectedTransactionVersion: live.version + 40 },
          }),
        DealRoomVersionConflictError
      );
      await assert.rejects(
        () =>
          svc.getDealRoom({
            transactionId: tx.id,
            actorUserId: buyerId,
            query: {
              expectedTransactionVersion: live.version,
              expectedActiveOfferVersion: offer.version + 7,
            },
          }),
        DealRoomVersionConflictError
      );
      const ok = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
        query: {
          expectedTransactionVersion: live.version,
          expectedActiveOfferVersion: offer.version,
        },
      });
      assert.equal(ok.transactionVersion, live.version);
      assert.equal(ok.activeOfferVersion, offer.version);
    });
  }

  // —— 15 timeline preview ——
  for (let i = 0; i < 15; i++) {
    it(`timeline preview #${i}`, async () => {
      const { tx, buyerId, svc } = await setupPending(`tl-${i}`);
      for (let m = 0; m < 3; m++) {
        await q.query(
          `INSERT INTO vauto_transaction_messages (
             id, transaction_id, sender_id, message_type, text, idempotency_key, chat_version
           ) VALUES ($1,$2,$3,'USER_MESSAGE',$4,$5,'1.0')`,
          [
            `msg-${i}-${m}-${seq}`,
            tx.id,
            buyerId,
            `Žinutė ${m} <b>x</b>`,
            key(`msg-${i}-${m}`),
          ]
        );
      }
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
        query: { timelineLimit: 10 },
      });
      assert.ok(room.timelinePreview.length >= 3);
      assert.ok(room.timelinePreview.length <= 20);
      assert.ok(
        room.timelinePreview.some((t) => t.textSafe.includes("&lt;b&gt;"))
      );
      const adapted = adaptTimelinePreview(
        room.timelinePreview.map((t) => ({
          ...t,
          text: t.textSafe,
        })),
        12
      );
      assert.ok(adapted.length <= 20);
      assert.equal(adapted.length, Math.min(20, Math.max(room.timelinePreview.length, 0)));
    });
  }

  // —— 10 archived listing still reachable ——
  for (let i = 0; i < 10; i++) {
    it(`archived listing deal still reachable #${i}`, async () => {
      const { tx, buyerId, svc, listingId } = await setupPending(`arch-${i}`);
      await q.query(`UPDATE listings SET status = 'archived' WHERE id = $1`, [
        listingId,
      ]);
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
      });
      assert.equal(room.transaction.id, tx.id);
      assert.equal(room.listing.id, listingId);
    });
  }

  // —— 10 malformed / adversarial ——
  for (let i = 0; i < 10; i++) {
    it(`malformed adversarial #${i}`, async () => {
      const { tx, buyerId, svc } = await setupPending(`adv-${i}`);
      await assert.rejects(() =>
        svc.getDealRoom({
          transactionId: tx.id,
          actorUserId: buyerId,
          query: { timelineLimit: 99 },
        })
      );
      await assert.rejects(() =>
        svc.getDealRoom({
          transactionId: tx.id,
          actorUserId: buyerId,
          query: { execute: "PAY" } as never,
        })
      );
      const room = await svc.getDealRoom({
        transactionId: tx.id,
        actorUserId: buyerId,
        query: {},
      });
      assert.equal(room.transactionSummary.paymentStatus, "NOT_AVAILABLE");
      const hash = computeSnapshotHash({
        transactionId: "t",
        acceptedOfferId: "o",
        amountCents: 100,
        listingId: "L",
        listingTitle: "T",
        listingAttributes: { a: 1 },
        listingPrimaryImage: null,
        buyerId: "b",
        sellerId: "s",
      });
      assert.equal(hash.length, 64);
    });
  }

  it("seller AGREED room has no PAY action", async () => {
    const { tx, sellerId, svc } = await setupAgreed(`nopay`, 99000);
    const room = await svc.getDealRoom({
      transactionId: tx.id,
      actorUserId: sellerId,
    });
    assert.deepEqual(
      room.transactionSummary,
      {
        paymentStatus: "NOT_AVAILABLE",
        shippingStatus: "NOT_AVAILABLE",
        protectionStatus: "NOT_AVAILABLE",
      }
    );
    assert.ok(!JSON.stringify(room).includes("PAYMENT_READY"));
  });
});

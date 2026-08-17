/**
 * Stage 13C / 13C.1 — Universal Deal Room unit/integration (Tests A–K, M–R).
 * 13A registry is read-only. 11J payments/ are not imported for mutation.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { signAccessToken } from "../../auth/tokens.js";
import { optionalAuth } from "../../middleware/auth.js";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  setTxQueryableOverride,
  type TxQueryable,
} from "../../transaction/index.js";
import { OFFERS_MIGRATION_SQL, OfferEngine } from "../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../deal-room/index.js";
import { PAYMENT_LEDGER_MIGRATION_SQL } from "../../payment/index.js";
import { offersRouter } from "../../routes/offers.js";
import { paymentIntentRouter } from "../../routes/payment-intent.js";
import { universalDealRoomRouter } from "../../routes/universal-deal-room.js";
import { dealRoomRouter } from "../../routes/deal-room.js";
import {
  DealCapabilityDeniedError,
  createUniversalDealRoomService,
} from "../universal-deal-room-service.js";
import { DealNegotiationStateError } from "../../shared/marketplace-domain/deal-actions.js";

process.env.JWT_SECRET =
  process.env.JWT_SECRET?.trim() || "vauto-dev-secret-change-in-production";

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

function token(userId: string) {
  return signAccessToken({ sub: userId, role: "private", provider: "phone" });
}

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
`;

describe("Stage 13C Universal Deal Room", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let seq = 0;
  const idem = (p: string) => `${p}-${++seq}-${randomUUID().slice(0, 8)}`;

  function app() {
    const e = express();
    e.use(express.json());
    e.use(optionalAuth);
    e.use("/api", offersRouter);
    e.use("/api", paymentIntentRouter);
    e.use("/api", universalDealRoomRouter);
    e.use("/api", dealRoomRouter);
    return e;
  }

  async function seedListing(input: {
    id: string;
    sellerId: string;
    category: string;
    verticalId: string;
    title?: string;
  }) {
    await q.query(
      `INSERT INTO listings (id, seller_id, title, price, attributes, category, status)
       VALUES ($1,$2,$3,1000,$4::jsonb,$5,'active')`,
      [
        input.id,
        input.sellerId,
        input.title ?? `Skelbimas ${input.id}`,
        JSON.stringify({ _canonicalVertical: input.verticalId }),
        input.category,
      ]
    );
  }

  async function openDeal(input: {
    listingId: string;
    buyerId: string;
    sellerId: string;
    category: string;
    verticalId: string;
  }) {
    await seedListing({
      id: input.listingId,
      sellerId: input.sellerId,
      category: input.category,
      verticalId: input.verticalId,
    });
    return txRepo.create({
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      currentPrice: null,
    });
  }

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(PAYMENT_LEDGER_MIGRATION_SQL);
    await db.exec(LISTINGS_SQL);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    setTxQueryableOverride(q);
  });

  after(async () => {
    setTxQueryableOverride(null);
    await db?.close();
  });

  it("A — TRANSPORT offer → counter → accept, history immutable", async () => {
    const buyer = "buyer-a";
    const seller = "seller-a";
    const tx = await openDeal({
      listingId: "L-A",
      buyerId: buyer,
      sellerId: seller,
      category: "transport",
      verticalId: "TRANSPORT",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: buyer,
      amountCents: 900000,
      idempotencyKey: idem("a-o"),
    });
    assert.equal(o1.offer.status, "PENDING");
    assert.equal(o1.offer.amountCents, 900000);
    const o2 = await svc.counterOffer({
      offerId: o1.offer.id,
      actorUserId: seller,
      amountCents: 950000,
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("a-c"),
    });
    assert.equal(o2.offer.parentOfferId, o1.offer.id);
    assert.equal(o2.offer.amountCents, 950000);
    const parent = await new OfferEngine(q).get(o1.offer.id);
    assert.equal(parent!.status, "COUNTERED");
    assert.equal(parent!.amountCents, 900000);
    const acc = await svc.acceptOffer({
      offerId: o2.offer.id,
      actorUserId: buyer,
      expectedVersion: o2.offer.version,
      idempotencyKey: idem("a-acc"),
    });
    assert.equal(acc.offer.status, "ACCEPTED");
    assert.equal(acc.transaction.status, "AGREED");
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: buyer });
    assert.equal(snap.dealState, "ACCEPTED");
    assert.equal(snap.verticalId, "TRANSPORT");
    assert.equal(snap.history.length, 2);
    assert.equal(snap.history[0].amountCents, 900000);
    assert.equal(snap.history[0].status, "COUNTERED");
    assert.ok(snap.allowedDealActions.includes("INITIATE_PAYMENT"));
  });

  it("B — REAL_ESTATE negotiation works; platform checkout rejected", async () => {
    const buyer = "buyer-b";
    const seller = "seller-b";
    const tx = await openDeal({
      listingId: "L-B",
      buyerId: buyer,
      sellerId: seller,
      category: "real_estate",
      verticalId: "REAL_ESTATE",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: buyer,
      amountCents: 12000000,
      idempotencyKey: idem("b-o"),
    });
    const acc = await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: seller,
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("b-acc"),
    });
    assert.equal(acc.transaction.status, "AGREED");
    await assert.rejects(
      () =>
        svc.initiatePayment({
          transactionId: tx.id,
          actorUserId: buyer,
          body: { idempotencyKey: idem("b-pay") },
        }),
      DealCapabilityDeniedError
    );
    const http = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({ idempotencyKey: idem("b-pay-http") });
    assert.equal(http.status, 403);
    assert.equal(http.body.error, "DEAL_CAPABILITY_DENIED");
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: buyer });
    assert.equal(snap.viewerDealActions.includes("INITIATE_PAYMENT"), false);
    assert.equal(snap.capabilities.supportsPlatformPayment, false);
  });

  it("C — ELECTRONICS offer → accept; payment capability visible", async () => {
    const buyer = "buyer-c";
    const seller = "seller-c";
    const tx = await openDeal({
      listingId: "L-C",
      buyerId: buyer,
      sellerId: seller,
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: buyer,
      amountCents: 25000,
      idempotencyKey: idem("c-o"),
    });
    await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: seller,
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("c-acc"),
    });
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: buyer });
    assert.equal(snap.verticalId, "ELECTRONICS");
    assert.equal(snap.capabilities.supportsPlatformPayment, true);
    assert.ok(snap.viewerDealActions.includes("INITIATE_PAYMENT"));
  });

  it("D — JOBS purchase offer and payment are rejected", async () => {
    const buyer = "buyer-d";
    const seller = "seller-d";
    const tx = await openDeal({
      listingId: "L-D",
      buyerId: buyer,
      sellerId: seller,
      category: "jobs",
      verticalId: "JOBS",
    });
    const svc = createUniversalDealRoomService(q);
    await assert.rejects(
      () =>
        svc.createOffer({
          transactionId: tx.id,
          actorUserId: buyer,
          amountCents: 1000,
          idempotencyKey: idem("d-o"),
        }),
      DealCapabilityDeniedError
    );
    const httpOffer = await request(app())
      .post(`/api/transactions/${tx.id}/offers`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({ amountCents: 1000, currency: "EUR", idempotencyKey: idem("d-o-http") });
    assert.equal(httpOffer.status, 403);
    const httpPay = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({ idempotencyKey: idem("d-pay") });
    assert.equal(httpPay.status, 403);
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: buyer });
    assert.ok(snap.allowedDealActions.includes("APPLICATION"));
    assert.equal(snap.allowedDealActions.includes("OFFER"), false);
  });

  it("E — IDOR: stranger cannot read or mutate", async () => {
    const tx = await openDeal({
      listingId: "L-E",
      buyerId: "buyer-e",
      sellerId: "seller-e",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-e",
      amountCents: 4000,
      idempotencyKey: idem("e-o"),
    });
    const stranger = token("stranger-e");
    const room = await request(app())
      .get(`/api/transactions/${tx.id}/universal-deal`)
      .set("Authorization", `Bearer ${stranger}`);
    assert.equal(room.status, 404);
    const offer = await request(app())
      .post(`/api/transactions/${tx.id}/offers`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ amountCents: 1, currency: "EUR", idempotencyKey: idem("e-str-o") });
    assert.equal(offer.status, 404);
    const acc = await request(app())
      .post(`/api/offers/${o1.offer.id}/accept`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ idempotencyKey: idem("e-str-a"), expectedVersion: 0 });
    assert.equal(acc.status, 404);
    const rej = await request(app())
      .post(`/api/offers/${o1.offer.id}/reject`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ idempotencyKey: idem("e-str-r"), expectedVersion: 0 });
    assert.equal(rej.status, 404);
    const pay = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent`)
      .set("Authorization", `Bearer ${stranger}`)
      .send({ idempotencyKey: idem("e-str-p") });
    assert.ok(pay.status === 404 || pay.status === 403);
  });

  it("F — forged vertical on JOBS listing cannot unlock payment", async () => {
    const tx = await openDeal({
      listingId: "L-F",
      buyerId: "buyer-f",
      sellerId: "seller-f",
      category: "jobs",
      verticalId: "JOBS",
    });
    const http = await request(app())
      .post(`/api/transactions/${tx.id}/universal-deal/offers`)
      .set("Authorization", `Bearer ${token("buyer-f")}`)
      .send({
        amountCents: 50000,
        currency: "EUR",
        idempotencyKey: idem("f-o"),
        verticalId: "ELECTRONICS",
        vertical: "electronics",
      });
    assert.equal(http.status, 403);
    const pay = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent`)
      .set("Authorization", `Bearer ${token("buyer-f")}`)
      .send({
        idempotencyKey: idem("f-p"),
        verticalId: "ELECTRONICS",
      });
    assert.equal(pay.status, 403);
  });

  it("G — double accept: one authoritative transition", async () => {
    const tx = await openDeal({
      listingId: "L-G",
      buyerId: "buyer-g",
      sellerId: "seller-g",
      category: "transport",
      verticalId: "TRANSPORT",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-g",
      amountCents: 7000,
      idempotencyKey: idem("g-o"),
    });
    const results = await Promise.allSettled([
      svc.acceptOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-g",
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("g-a1"),
      }),
      svc.acceptOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-g",
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("g-a2"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const live = await txRepo.getById(tx.id);
    assert.equal(live!.status, "AGREED");
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: "buyer-g" });
    assert.equal(snap.history.filter((h) => h.status === "ACCEPTED").length, 1);
  });

  it("H — accept vs reject race: one final state", async () => {
    const tx = await openDeal({
      listingId: "L-H",
      buyerId: "buyer-h",
      sellerId: "seller-h",
      category: "home",
      verticalId: "HOME_GARDEN",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-h",
      amountCents: 8000,
      idempotencyKey: idem("h-o"),
    });
    const results = await Promise.allSettled([
      svc.acceptOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-h",
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("h-acc"),
      }),
      svc.rejectOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-h",
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("h-rej"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const offer = await new OfferEngine(q).get(o1.offer.id);
    assert.ok(offer!.status === "ACCEPTED" || offer!.status === "REJECTED");
    if (offer!.status === "ACCEPTED") {
      const live = await txRepo.getById(tx.id);
      assert.equal(live!.status, "AGREED");
    }
  });

  it("I — counter after accepted is rejected", async () => {
    const tx = await openDeal({
      listingId: "L-I",
      buyerId: "buyer-i",
      sellerId: "seller-i",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-i",
      amountCents: 9000,
      idempotencyKey: idem("i-o"),
    });
    const acc = await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: "seller-i",
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("i-acc"),
    });
    await assert.rejects(
      () =>
        svc.counterOffer({
          offerId: acc.offer.id,
          actorUserId: "buyer-i",
          amountCents: 8000,
          expectedVersion: acc.offer.version,
          idempotencyKey: idem("i-c"),
        }),
      (err: unknown) =>
        err instanceof DealNegotiationStateError ||
        (err instanceof Error && /PENDING|transition/i.test(err.message))
    );
  });

  it("J — money tampering: accepted 500 €, client 5 € is not trusted", async () => {
    const tx = await openDeal({
      listingId: "L-J",
      buyerId: "buyer-j",
      sellerId: "seller-j",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-j",
      amountCents: 50000,
      idempotencyKey: idem("j-o"),
    });
    await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: "seller-j",
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("j-acc"),
    });
    const tamper = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent`)
      .set("Authorization", `Bearer ${token("buyer-j")}`)
      .send({ idempotencyKey: idem("j-tamper"), amountCents: 500 });
    assert.equal(tamper.status, 400);
    const stripeTamper = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent/stripe-intent`)
      .set("Authorization", `Bearer ${token("buyer-j")}`)
      .send({ idempotencyKey: idem("j-stripe-tamper"), amountCents: 500 });
    assert.equal(stripeTamper.status, 400);
    const pay = await request(app())
      .post(`/api/transactions/${tx.id}/universal-deal/payment`)
      .set("Authorization", `Bearer ${token("buyer-j")}`)
      .send({ idempotencyKey: idem("j-pay"), amountCents: 500, amount: 5 });
    assert.ok(pay.status === 200 || pay.status === 201, pay.text);
    assert.equal(pay.body.amountCents, 50000);
    assert.equal(pay.body.paymentIntent.amountCents, 50000);
  });

  it("K — AI unavailable does not block core negotiation", async () => {
    const tx = await openDeal({
      listingId: "L-K",
      buyerId: "buyer-k",
      sellerId: "seller-k",
      category: "transport",
      verticalId: "TRANSPORT",
    });
    const svc = createUniversalDealRoomService(q, {
      suggest: async () => {
        throw new Error("AI timeout");
      },
    });
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-k",
      amountCents: 11100,
      idempotencyKey: idem("k-o"),
    });
    const acc = await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: "seller-k",
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("k-acc"),
    });
    assert.equal(acc.offer.status, "ACCEPTED");
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: "buyer-k" });
    assert.equal(snap.dealState, "ACCEPTED");
  });

  it("Race A — parallel counters yield one current PENDING offer", async () => {
    const tx = await openDeal({
      listingId: "L-RA",
      buyerId: "buyer-ra",
      sellerId: "seller-ra",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-ra",
      amountCents: 4000,
      idempotencyKey: idem("ra-o"),
    });
    const results = await Promise.allSettled([
      svc.counterOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-ra",
        amountCents: 4100,
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("ra-c1"),
      }),
      svc.counterOffer({
        offerId: o1.offer.id,
        actorUserId: "seller-ra",
        amountCents: 4200,
        expectedVersion: o1.offer.version,
        idempotencyKey: idem("ra-c2"),
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: "buyer-ra" });
    const pending = snap.history.filter((h) => h.status === "PENDING");
    assert.equal(pending.length, 1);
  });

  it("no category === auto branching: HOME_GARDEN uses same offer API as TRANSPORT", async () => {
    const tx = await openDeal({
      listingId: "L-HG",
      buyerId: "buyer-hg",
      sellerId: "seller-hg",
      category: "home",
      verticalId: "HOME_GARDEN",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-hg",
      amountCents: 3300,
      idempotencyKey: idem("hg-o"),
    });
    assert.equal(o1.offer.amountCents, 3300);
    const snap = await svc.getSnapshot({ transactionId: tx.id, actorUserId: "buyer-hg" });
    assert.equal(snap.verticalId, "HOME_GARDEN");
  });

  it("M — JOBS Stripe bypass: /stripe-intent is fail-closed, Stripe not reached", async () => {
    const buyer = "buyer-m";
    const seller = "seller-m";
    const tx = await openDeal({
      listingId: "L-M",
      buyerId: buyer,
      sellerId: seller,
      category: "jobs",
      verticalId: "JOBS",
    });
    await q.query(`UPDATE vauto_transactions SET status = 'AGREED' WHERE id = $1`, [
      tx.id,
    ]);
    let stripeCalls = 0;
    const svc = createUniversalDealRoomService(q, {}, {
      stripeIntent: {
        createStripePaymentIntent: async () => {
          stripeCalls += 1;
          throw new Error("STRIPE_REACHED");
        },
      },
    });
    await assert.rejects(
      () =>
        svc.createStripePaymentIntent({
          transactionId: tx.id,
          actorUserId: buyer,
          body: { idempotencyKey: idem("m-svc") },
          clientVertical: "ELECTRONICS",
        }),
      (err: unknown) =>
        err instanceof DealCapabilityDeniedError && err.verticalId === "JOBS"
    );
    assert.equal(stripeCalls, 0);

    const http = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent/stripe-intent`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({ idempotencyKey: idem("m-http") });
    assert.equal(http.status, 403);
    assert.equal(http.body.error, "DEAL_CAPABILITY_DENIED");
    assert.equal(http.body.verticalId, "JOBS");
    assert.equal(http.body.action, "INITIATE_PAYMENT");
  });

  it("N — REAL_ESTATE Stripe bypass: no e-commerce Stripe intent", async () => {
    const buyer = "buyer-n";
    const seller = "seller-n";
    const tx = await openDeal({
      listingId: "L-N",
      buyerId: buyer,
      sellerId: seller,
      category: "real_estate",
      verticalId: "REAL_ESTATE",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: buyer,
      amountCents: 15000000,
      idempotencyKey: idem("n-o"),
    });
    await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: seller,
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("n-acc"),
    });
    let stripeCalls = 0;
    const gated = createUniversalDealRoomService(q, {}, {
      stripeIntent: {
        createStripePaymentIntent: async () => {
          stripeCalls += 1;
          throw new Error("STRIPE_REACHED");
        },
      },
    });
    await assert.rejects(
      () =>
        gated.createStripePaymentIntent({
          transactionId: tx.id,
          actorUserId: buyer,
          body: { idempotencyKey: idem("n-svc") },
        }),
      DealCapabilityDeniedError
    );
    assert.equal(stripeCalls, 0);
    const http = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent/stripe-intent`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({ idempotencyKey: idem("n-http") });
    assert.equal(http.status, 403);
    assert.equal(http.body.error, "DEAL_CAPABILITY_DENIED");
    assert.equal(http.body.verticalId, "REAL_ESTATE");
  });

  it("O — forged client vertical is ignored; listing canonical vertical wins", async () => {
    const buyer = "buyer-o";
    const seller = "seller-o";
    const tx = await openDeal({
      listingId: "L-O",
      buyerId: buyer,
      sellerId: seller,
      category: "jobs",
      verticalId: "JOBS",
    });
    await q.query(`UPDATE vauto_transactions SET status = 'AGREED' WHERE id = $1`, [
      tx.id,
    ]);
    const http = await request(app())
      .post(`/api/transactions/${tx.id}/payment-intent/stripe-intent`)
      .set("Authorization", `Bearer ${token(buyer)}`)
      .send({
        idempotencyKey: idem("o-http"),
        verticalId: "ELECTRONICS",
      });
    assert.equal(http.status, 403);
    assert.equal(http.body.error, "DEAL_CAPABILITY_DENIED");
    assert.equal(http.body.verticalId, "JOBS");
    assert.notEqual(http.body.verticalId, "ELECTRONICS");

    const re = await openDeal({
      listingId: "L-O-RE",
      buyerId: "buyer-o-re",
      sellerId: "seller-o-re",
      category: "real_estate",
      verticalId: "REAL_ESTATE",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: re.id,
      actorUserId: "buyer-o-re",
      amountCents: 9900000,
      idempotencyKey: idem("o-re-o"),
    });
    await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: "seller-o-re",
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("o-re-acc"),
    });
    const forged = await request(app())
      .post(`/api/transactions/${re.id}/payment-intent/stripe-intent`)
      .set("Authorization", `Bearer ${token("buyer-o-re")}`)
      .send({
        idempotencyKey: idem("o-re-http"),
        verticalId: "ELECTRONICS",
      });
    assert.equal(forged.status, 403);
    assert.equal(forged.body.verticalId, "REAL_ESTATE");
  });

  it("P — third-party withdraw is fail-closed", async () => {
    const tx = await openDeal({
      listingId: "L-P",
      buyerId: "buyer-p",
      sellerId: "seller-p",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-p",
      amountCents: 4400,
      idempotencyKey: idem("p-o"),
    });
    const http = await request(app())
      .post(`/api/offers/${o1.offer.id}/withdraw`)
      .set("Authorization", `Bearer ${token("stranger-p")}`)
      .send({
        idempotencyKey: idem("p-w"),
        expectedVersion: o1.offer.version,
      });
    assert.equal(http.status, 404);
    assert.equal(http.body.error, "not_found");
    const live = await new OfferEngine(q).get(o1.offer.id);
    assert.equal(live!.status, "PENDING");
  });

  it("Q — withdraw after accepted is rejected", async () => {
    const tx = await openDeal({
      listingId: "L-Q",
      buyerId: "buyer-q",
      sellerId: "seller-q",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q);
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-q",
      amountCents: 5500,
      idempotencyKey: idem("q-o"),
    });
    const acc = await svc.acceptOffer({
      offerId: o1.offer.id,
      actorUserId: "seller-q",
      expectedVersion: o1.offer.version,
      idempotencyKey: idem("q-acc"),
    });
    const http = await request(app())
      .post(`/api/offers/${acc.offer.id}/withdraw`)
      .set("Authorization", `Bearer ${token("buyer-q")}`)
      .send({
        idempotencyKey: idem("q-w"),
        expectedVersion: acc.offer.version,
      });
    assert.equal(http.status, 422);
    assert.equal(http.body.error, "DEAL_INVALID_TRANSITION");
    const live = await new OfferEngine(q).get(acc.offer.id);
    assert.equal(live!.status, "ACCEPTED");
  });

  it("R — owner can withdraw a PENDING offer", async () => {
    const tx = await openDeal({
      listingId: "L-R",
      buyerId: "buyer-r",
      sellerId: "seller-r",
      category: "electronics",
      verticalId: "ELECTRONICS",
    });
    const svc = createUniversalDealRoomService(q, {
      suggest: async () => {
        throw new Error("AI timeout");
      },
    });
    const o1 = await svc.createOffer({
      transactionId: tx.id,
      actorUserId: "buyer-r",
      amountCents: 6600,
      idempotencyKey: idem("r-o"),
    });
    const http = await request(app())
      .post(`/api/offers/${o1.offer.id}/withdraw`)
      .set("Authorization", `Bearer ${token("buyer-r")}`)
      .send({
        idempotencyKey: idem("r-w"),
        expectedVersion: o1.offer.version,
      });
    assert.equal(http.status, 200);
    assert.equal(http.body.offer.status, "WITHDRAWN");
    const live = await new OfferEngine(q).get(o1.offer.id);
    assert.equal(live!.status, "WITHDRAWN");
  });
});

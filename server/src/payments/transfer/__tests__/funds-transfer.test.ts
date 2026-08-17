/**
 * Stage 11F.4 — Funds Transfer / Refund (180+ tests).
 * FakeStripeAdapter only — 0 live network calls.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  type TxQueryable,
} from "../../../transaction/index.js";
import {
  OFFERS_MIGRATION_SQL,
  OfferEngine,
} from "../../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../../deal-room/index.js";
import {
  PAYMENT_LEDGER_MIGRATION_SQL,
  PaymentRepository,
  listLedgerForIntent,
} from "../../../payment/index.js";
import {
  STRIPE_PI_MIGRATION_SQL,
  createTestStripePaymentIntentService,
  createStripeWebhookProcessor,
  generateTestStripeSignatureHeader,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
} from "../../stripe/index.js";
import {
  FUNDS_TRANSFER_VERSION,
  FUNDS_TRANSFER_MIGRATION_SQL,
  REFUND_PENDING_MIGRATION_SQL,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL,
  PLATFORM_FEE_PERCENT,
  calculatePlatformFeeSplit,
  assertFeeSplitInvariant,
  createTestFundsTransferService,
  ReleaseToSellerBodySchema,
  RefundToBuyerBodySchema,
  FundsTransferResultSchema,
  TransferBlockedError,
} from "../index.js";
import { randomUUID } from "node:crypto";

const TEST_WHSEC = "whsec_test_vauto_11f4_funds";

function adaptPglite(db: PGlite): TxQueryable {
  return {
    async query(text, params = []) {
      try {
        const res = await db.query(text, params as never[]);
        return {
          rows: (res.rows ?? []) as never[],
          rowCount: res.affectedRows ?? null,
        };
      } catch (e) {
        try {
          await db.exec("ROLLBACK");
        } catch {
          /* session already idle */
        }
        throw e;
      }
    },
  };
}

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
  status TEXT DEFAULT 'active'
);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS category TEXT;
`;

describe("11F.4 Funds Transfer & Refund", () => {
  let db: PGlite;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-idem-${++seq}-${Date.now()}`;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(OFFERS_MIGRATION_SQL);
    await db.exec(TRANSACTION_CHAT_MIGRATION_SQL);
    await db.exec(DEAL_ROOM_MIGRATION_SQL);
    await db.exec(PAYMENT_LEDGER_MIGRATION_SQL);
    await db.exec(STRIPE_PI_MIGRATION_SQL);
    await db.exec(STRIPE_WEBHOOKS_MIGRATION_SQL);
    await db.exec(FUNDS_TRANSFER_MIGRATION_SQL);
    await db.exec(REFUND_PENDING_MIGRATION_SQL);
    await db.exec(IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL);
    await db.exec(LISTINGS_STUB);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function seedListing(id: string) {
    await q.query(
      `INSERT INTO listings (id, seller_id, title, price, location, image, attributes, status, category)
       VALUES ($1,'seller-stub','T',100,'LT','https://img.example/a.jpg','{}'::jsonb,'active','electronics')
       ON CONFLICT (id) DO NOTHING`,
      [id]
    );
  }

  /** AGREED → Stripe PI → webhook succeeded → HELD + PAID → ship → DELIVERED */
  async function setupDeliveredHeld(tag: string, offerCents = 100000) {
    const listingId = `L-${tag}`;
    await seedListing(listingId);
    const buyerId = `buyer-${tag}`;
    const sellerId = `seller-${tag}`;
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
    });
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: offerCents,
      idempotencyKey: key(`c-${tag}`),
    });
    await offers.accept({
      offerId: created.offer.id,
      actorUserId: sellerId,
      idempotencyKey: key(`a-${tag}`),
      expectedVersion: created.offer.version,
    });

    const { service: stripeSvc } = createTestStripePaymentIntentService(q);
    const stripeRes = await stripeSvc.createStripePaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key(`s-${tag}`) },
    });

    const event = {
      id: `evt_${randomUUID().replace(/-/g, "")}`,
      object: "event",
      api_version: "2024-11-20.acacia",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: stripeRes.stripePaymentIntentId,
          object: "payment_intent",
          amount: offerCents,
          currency: "eur",
          status: "succeeded",
          metadata: {},
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = generateTestStripeSignatureHeader({
      payload,
      secret: TEST_WHSEC,
    });
    const wh = createStripeWebhookProcessor({
      db: q,
      webhookSecret: TEST_WHSEC,
      requireLivemode: false,
    });
    await wh.handleRawWebhook({
      rawBody: Buffer.from(payload, "utf8"),
      signatureHeader: signature,
    });

    let live = (await txRepo.getById(tx.id))!;
    // PAID → SHIPPING_PENDING → SHIPPED → DELIVERED
    live = (
      await txRepo.executeTransition({
        transactionId: live.id,
        toStatus: "SHIPPING_PENDING",
        actorType: "SELLER",
        actorId: sellerId,
        reasonCode: "SHIPMENT_READY",
        expectedVersion: live.version,
        idempotencyKey: key(`ship1-${tag}`),
      })
    ).transaction;
    live = (
      await txRepo.executeTransition({
        transactionId: live.id,
        toStatus: "SHIPPED",
        actorType: "SELLER",
        actorId: sellerId,
        reasonCode: "SHIPPED_CONFIRMED",
        expectedVersion: live.version,
        idempotencyKey: key(`ship2-${tag}`),
      })
    ).transaction;
    live = (
      await txRepo.executeTransition({
        transactionId: live.id,
        toStatus: "DELIVERED",
        actorType: "BUYER",
        actorId: buyerId,
        reasonCode: "DELIVERY_CONFIRMED",
        expectedVersion: live.version,
        idempotencyKey: key(`del-${tag}`),
      })
    ).transaction;

    const { service, fake } = createTestFundsTransferService(q, {
      sellerAccounts: { [sellerId]: `acct_fake_${tag}` },
    });

    const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
    return {
      txId: tx.id,
      buyerId,
      sellerId,
      offerCents,
      service,
      fake,
      intent: intent!,
      live,
    };
  }

  it("exports fundsTransferVersion 1.0", () => {
    assert.equal(FUNDS_TRANSFER_VERSION, "1.0");
    assert.equal(PLATFORM_FEE_PERCENT, 5);
  });

  // —— 35 fee calculator ——
  for (let i = 0; i < 35; i++) {
    it(`fee split invariant #${i}`, () => {
      const gross = 100 + i * 137;
      const split = calculatePlatformFeeSplit(gross);
      assert.equal(split.grossAmountCents, gross);
      assert.equal(
        split.platformFeeCents,
        Math.floor((gross * PLATFORM_FEE_PERCENT) / 100)
      );
      assert.equal(
        split.grossAmountCents,
        split.platformFeeCents + split.sellerNetCents
      );
      assertFeeSplitInvariant(split);
    });
  }

  // —— 35 releaseToSeller ——
  for (let i = 0; i < 35; i++) {
    it(`releaseToSeller Stripe transfer #${i}`, async () => {
      const cents = 100000 + i * 50;
      const ctx = await setupDeliveredHeld(`rel-${i}`, cents);
      const split = calculatePlatformFeeSplit(cents);
      const res = await ctx.service.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`rel-${i}`) },
      });
      assert.equal(res.transferStatus, "TRANSFERRED");
      assert.equal(res.status, "RELEASED_TO_SELLER");
      assert.equal(res.grossAmountCents, cents);
      assert.equal(res.platformFeeCents, split.platformFeeCents);
      assert.equal(res.sellerNetCents, split.sellerNetCents);
      assert.ok(res.stripeTransferId?.startsWith("tr_fake_"));
      assert.equal(ctx.fake.getTransferCallCount(), 1);
      FundsTransferResultSchema.parse(res);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.ok(ledger.some((e) => e.entryType === "SELLER_TRANSFERRED"));
      assert.equal(
        ledger.find((e) => e.entryType === "SELLER_TRANSFERRED")!.amountCents,
        split.sellerNetCents
      );
    });
  }

  // —— 30 refund before/after ——
  for (let i = 0; i < 15; i++) {
    it(`refund before transfer #${i}`, async () => {
      const ctx = await setupDeliveredHeld(`rbf-${i}`, 90000 + i);
      const res = await ctx.service.refundToBuyer({
        authority: "SYSTEM",
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`rbf-${i}`) },
      });
      assert.equal(res.transferStatus, "REFUNDED");
      assert.equal(res.status, "REFUNDED");
      assert.ok(res.stripeRefundId?.startsWith("re_fake_"));
      assert.equal(ctx.fake.getRefundCallCount(), 1);
      assert.equal(ctx.fake.getReversalCallCount(), 0);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.ok(ledger.some((e) => e.entryType === "BUYER_REFUNDED"));
      assert.ok(!ledger.some((e) => e.entryType === "TRANSFER_REVERSED"));
    });
  }

  for (let i = 0; i < 15; i++) {
    it(`refund after transfer reverses #${i}`, async () => {
      const ctx = await setupDeliveredHeld(`raf-${i}`, 95000 + i);
      await ctx.service.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`raf-rel-${i}`) },
      });
      ctx.fake.resetCallCount();
      const res = await ctx.service.refundToBuyer({
        authority: "SYSTEM",
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`raf-${i}`) },
      });
      assert.equal(res.transferStatus, "REFUNDED");
      assert.equal(ctx.fake.getReversalCallCount(), 1);
      assert.equal(ctx.fake.getRefundCallCount(), 1);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.ok(ledger.some((e) => e.entryType === "TRANSFER_REVERSED"));
      assert.ok(ledger.some((e) => e.entryType === "BUYER_REFUNDED"));
    });
  }

  // —— 25 concurrent release ——
  for (let i = 0; i < 25; i++) {
    it(`20 concurrent release → exactly 1 transfer #${i}`, async () => {
      const ctx = await setupDeliveredHeld(`conc-${i}`, 88000 + i);
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, j) =>
          ctx.service.releaseToSeller({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`conc-${i}-${j}`) },
          })
        )
      );
      const transferred = results.filter(
        (r) => r.transferStatus === "TRANSFERRED"
      );
      assert.equal(transferred.length, 20);
      const ids = new Set(transferred.map((r) => r.stripeTransferId));
      assert.equal(ids.size, 1);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
      assert.ok(ctx.fake.getTransferCallCount() >= 1);
      assert.ok(ctx.fake.getTransferCallCount() <= 20);
    });
  }

  // —— 20 seller not onboarded ——
  for (let i = 0; i < 20; i++) {
    it(`TRANSFER_BLOCKED when seller not onboarded #${i}`, async () => {
      const ctx = await setupDeliveredHeld(`block-${i}`, 87000 + i);
      const { service } = createTestFundsTransferService(q, {
        sellerAccounts: { [ctx.sellerId]: null },
      });
      const res = await service.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`block-${i}`) },
      });
      assert.equal(res.transferStatus, "TRANSFER_BLOCKED");
      assert.match(
        res.messageLt ?? "",
        /Pardavėjas turi užbaigti mokėjimų paskyros patvirtinimą/
      );
      const intent = await new PaymentRepository(q).getByTransactionId(ctx.txId);
      assert.equal(intent!.transferStatus, "TRANSFER_BLOCKED");
      assert.equal(intent!.stripeTransferId, null);
    });
  }

  // —— 20 client tampering ——
  const tampers = [
    { idempotencyKey: "abcdefgh", destinationAccountId: "acct_x" },
    { idempotencyKey: "abcdefgh", transferAmount: 1 },
    { idempotencyKey: "abcdefgh", platformFee: 1 },
    { idempotencyKey: "abcdefgh", platformFeeCents: 1 },
    { idempotencyKey: "abcdefgh", sellerNet: 1 },
    { idempotencyKey: "abcdefgh", sellerNetCents: 1 },
    { idempotencyKey: "abcdefgh", sellerStripeAccountId: "acct_y" },
    { idempotencyKey: "abcdefgh", amountCents: 1 },
    { idempotencyKey: "abcdefgh", currency: "USD" },
    { idempotencyKey: "abcdefgh", sellerId: "s" },
    { idempotencyKey: "abcdefgh", status: "TRANSFERRED" },
    { idempotencyKey: "abcdefgh", stripeTransferId: "tr_x" },
    { idempotencyKey: "abcdefgh", amount: 9 },
    {},
    { idempotencyKey: "short" },
    { destinationAccountId: "acct_z" },
    { idempotencyKey: "abcdefghij", transferAmount: 99 },
    { idempotencyKey: "abcdefghij", platformFeeCents: 5 },
    { idempotencyKey: "abcdefghij", sellerNetCents: 95 },
    { idempotencyKey: "abcdefghij", destinationAccountId: "acct_evil" },
  ];
  for (let i = 0; i < 20; i++) {
    it(`client tampering rejected #${i}`, () => {
      assert.throws(() => ReleaseToSellerBodySchema.parse(tampers[i]));
      assert.throws(() => RefundToBuyerBodySchema.parse(tampers[i]));
    });
  }

  // —— 15 crash recovery ——
  for (let i = 0; i < 15; i++) {
    it(`crash between transfer and TX2 recovers #${i}`, async () => {
      const ctx = await setupDeliveredHeld(`crash-${i}`, 86000 + i);
      const clientKey = key(`crash-c-${i}`);
      const pending = await ctx.service.tx1OnlyPrepareTransferForTests({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        clientIdempotencyKey: clientKey,
      });
      assert.equal(pending.transferStatus, "TRANSFER_PENDING");
      assert.equal(pending.stripeTransferId, null);

      const split = calculatePlatformFeeSplit(ctx.offerCents);
      const transfer = await ctx.fake.createTransfer({
        amountCents: split.sellerNetCents,
        currency: "eur",
        destinationAccountId: `acct_fake_crash-${i}`,
        idempotencyKey: `vauto:transaction:${ctx.txId}:seller-transfer:1`,
      });
      ctx.fake.resetCallCount();

      const recovered = await ctx.service.releaseToSeller({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: clientKey },
      });
      assert.equal(recovered.transferStatus, "TRANSFERRED");
      assert.equal(recovered.stripeTransferId, transfer.id);
      assert.equal(ctx.fake.getTransferCallCount(), 1);
    });
  }

  it("TransferBlockedError messageLt is Lithuanian", () => {
    const e = new TransferBlockedError();
    assert.match(e.messageLt, /Pardavėjas/);
  });
});

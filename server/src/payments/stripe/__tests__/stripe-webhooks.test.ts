/**
 * Stage 11F.3 — Stripe Signed Webhooks (220+ tests).
 * Signature / raw-body / inbox dedup / reconciliation / monotonic / concurrency.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
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
} from "../index.js";
import {
  STRIPE_WEBHOOKS_VERSION,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
  createStripeWebhookProcessor,
  generateTestStripeSignatureHeader,
  assertRawBodyUnmodified,
  verifyStripeWebhookSignature,
  StripeWebhookSignatureError,
  WebhookInboxRepository,
  hashWebhookPayload,
  WebhookHandleResultSchema,
} from "../webhooks/index.js";

const TEST_WHSEC = "whsec_test_vauto_11f3_secret_key_0001";

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

function buildPiEvent(input: {
  eventId?: string;
  type: string;
  piId: string;
  amount: number;
  currency?: string;
  status?: string;
  livemode?: boolean;
}) {
  const event = {
    id: input.eventId ?? `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    api_version: "2024-11-20.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: input.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: input.type,
    data: {
      object: {
        id: input.piId,
        object: "payment_intent",
        amount: input.amount,
        currency: input.currency ?? "eur",
        status: input.status ?? "succeeded",
        metadata: {},
      },
    },
  };
  const payload = JSON.stringify(event);
  const signature = generateTestStripeSignatureHeader({
    payload,
    secret: TEST_WHSEC,
  });
  return {
    event,
    payload,
    rawBody: Buffer.from(payload, "utf8"),
    signature,
  };
}

describe("11F.3 Stripe Signed Webhooks", () => {
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
    await db.exec(LISTINGS_STUB);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  function processor() {
    return createStripeWebhookProcessor({
      db: q,
      webhookSecret: TEST_WHSEC,
      requireLivemode: false,
    });
  }

  async function seedListing(id: string) {
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes, status)
       VALUES ($1,'T',100,'https://img.example/a.jpg','{}'::jsonb,'active')
       ON CONFLICT (id) DO NOTHING`,
      [id]
    );
  }

  async function setupAuthorizingDeal(tag: string, offerCents = 90000) {
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
    const { service } = createTestStripePaymentIntentService(q);
    const stripeRes = await service.createStripePaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key(`s-${tag}`) },
    });
    const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
    return {
      txId: tx.id,
      buyerId,
      sellerId,
      offerCents,
      stripePaymentIntentId: stripeRes.stripePaymentIntentId,
      intent: intent!,
    };
  }

  it("exports stripeWebhooksVersion 1.0", () => {
    assert.equal(STRIPE_WEBHOOKS_VERSION, "1.0");
  });

  // —— 40 signature & raw-body ——
  for (let i = 0; i < 25; i++) {
    it(`invalid signature → 400 class, 0 DB #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`sig-${i}`, 80000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const inboxBefore = await new WebhookInboxRepository(q).getByStripeEventId(
        built.event.id
      );
      assert.equal(inboxBefore, null);
      await assert.rejects(
        () =>
          processor().handleRawWebhook({
            rawBody: built.rawBody,
            signatureHeader: "t=1,v1=deadbeef",
          }),
        (e: unknown) => e instanceof StripeWebhookSignatureError
      );
      const inboxAfter = await new WebhookInboxRepository(q).getByStripeEventId(
        built.event.id
      );
      assert.equal(inboxAfter, null);
      const live = (await txRepo.getById(deal.txId))!;
      assert.equal(live.status, "PAYMENT_PENDING");
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`modified body fails signature #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`mod-${i}`, 81000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const tampered = Buffer.from(built.payload.replace("succeeded", "succeeded "), "utf8");
      await assert.rejects(
        () =>
          processor().handleRawWebhook({
            rawBody: tampered,
            signatureHeader: built.signature,
          }),
        (e: unknown) => e instanceof StripeWebhookSignatureError
      );
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`Express raw middleware preserves bytes #${i}`, async () => {
      const payload = JSON.stringify({
        id: `evt_raw_${i}`,
        n: i,
        pad: "x".repeat(50 + i),
      });
      const app = express();
      let seen: Buffer | null = null;
      app.post(
        "/api/webhooks/stripe",
        express.raw({ type: "application/json" }),
        (req, res) => {
          seen = req.body as Buffer;
          res.status(200).json({
            isBuffer: Buffer.isBuffer(req.body),
            match: assertRawBodyUnmodified(
              req.body as Buffer,
              payload
            ),
          });
        }
      );
      // Ensure json parser AFTER would break — prove raw route is first
      app.use(express.json());
      const server = createServer(app);
      await new Promise<void>((r) => server.listen(0, r));
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      const json = (await res.json()) as { isBuffer: boolean; match: boolean };
      assert.equal(json.isBuffer, true);
      assert.equal(json.match, true);
      assert.ok(seen && assertRawBodyUnmodified(seen, payload));
      await new Promise<void>((r) => server.close(() => r()));
    });
  }

  // —— 30 duplicate & inbox dedup ——
  for (let i = 0; i < 20; i++) {
    it(`duplicate event dedup #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`dup-${i}`, 82000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const a = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      const b = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(a.outcome, "processed");
      assert.equal(b.outcome, "duplicate");
      WebhookHandleResultSchema.parse(a);
      const ledger = await listLedgerForIntent(q, deal.intent.id);
      const holds = ledger.filter((e) => e.entryType === "ESCROW_HOLD");
      assert.equal(holds.length, 1);
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`20 concurrent deliveries → 1 ledger hold #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`conc-${i}`, 83000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          processor().handleRawWebhook({
            rawBody: built.rawBody,
            signatureHeader: built.signature,
          })
        )
      );
      assert.ok(results.every((r) => r.ok));
      const processed = results.filter((r) => r.outcome === "processed");
      assert.ok(processed.length >= 1);
      const ledger = await listLedgerForIntent(q, deal.intent.id);
      assert.equal(ledger.filter((e) => e.entryType === "ESCROW_HOLD").length, 1);
      const inbox = await new WebhookInboxRepository(q).getByStripeEventId(
        built.event.id
      );
      assert.equal(inbox?.status, "PROCESSED");
    });
  }

  // —— 30 reconciliation ——
  for (let i = 0; i < 25; i++) {
    it(`amount mismatch → FAILED + alarm, no PAID #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`rec-${i}`, 84000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents + 999,
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "failed_reconciliation");
      const live = (await txRepo.getById(deal.txId))!;
      assert.equal(live.status, "PAYMENT_PENDING");
      const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
      assert.notEqual(intent!.status, "HELD_IN_ESCROW");
      const inbox = await new WebhookInboxRepository(q).getByStripeEventId(
        built.event.id
      );
      assert.equal(inbox?.status, "FAILED");
      const ledger = await listLedgerForIntent(q, deal.intent.id);
      assert.ok(
        ledger.some(
          (e) =>
            e.entryType === "FEE" &&
            e.payloadJson.alarm === "RECONCILIATION_MISMATCH"
        )
      );
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`currency mismatch fail-closed #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`cur-${i}`, 85000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        currency: "usd",
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "failed_reconciliation");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAYMENT_PENDING");
    });
  }

  // —— 25 out-of-order & monotonic ——
  for (let i = 0; i < 15; i++) {
    it(`processing after succeeded is noop #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`ooo-${i}`, 86000 + i);
      const ok = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      await processor().handleRawWebhook({
        rawBody: ok.rawBody,
        signatureHeader: ok.signature,
      });
      const late = buildPiEvent({
        type: "payment_intent.processing",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        status: "processing",
      });
      const res = await processor().handleRawWebhook({
        rawBody: late.rawBody,
        signatureHeader: late.signature,
      });
      assert.equal(res.outcome, "noop_monotonic");
      const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
      assert.equal(intent!.status, "HELD_IN_ESCROW");
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`failed after succeeded is noop #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`failooo-${i}`, 87000 + i);
      const ok = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      await processor().handleRawWebhook({
        rawBody: ok.rawBody,
        signatureHeader: ok.signature,
      });
      const fail = buildPiEvent({
        type: "payment_intent.payment_failed",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        status: "requires_payment_method",
      });
      const res = await processor().handleRawWebhook({
        rawBody: fail.rawBody,
        signatureHeader: fail.signature,
      });
      assert.equal(res.outcome, "noop_monotonic");
      const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
      assert.equal(intent!.status, "HELD_IN_ESCROW");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAID");
    });
  }

  // —— 25 payment domain & 11A atomic ——
  for (let i = 0; i < 20; i++) {
    it(`succeeded → HELD_IN_ESCROW + PAID #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`paid-${i}`, 88000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "processed");
      const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
      assert.equal(intent!.status, "HELD_IN_ESCROW");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAID");
      // No release / payout in 11F.3
      assert.notEqual(intent!.status, "RELEASED_TO_SELLER");
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`payment_failed → FAILED, stays PAYMENT_PENDING #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`pfail-${i}`, 89000 + i);
      const built = buildPiEvent({
        type: "payment_intent.payment_failed",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        status: "requires_payment_method",
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "processed");
      const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
      assert.equal(intent!.status, "FAILED");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAYMENT_PENDING");
    });
  }

  // —— 20 concurrency SKIP LOCKED (inbox claim) ——
  for (let i = 0; i < 20; i++) {
    it(`inbox claim concurrency stable #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`skip-${i}`, 90000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      await Promise.all([
        processor().handleRawWebhook({
          rawBody: built.rawBody,
          signatureHeader: built.signature,
        }),
        processor().handleRawWebhook({
          rawBody: built.rawBody,
          signatureHeader: built.signature,
        }),
        processor().handleRawWebhook({
          rawBody: built.rawBody,
          signatureHeader: built.signature,
        }),
      ]);
      const count = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_stripe_webhook_events WHERE stripe_event_id = $1`,
        [built.event.id]
      );
      assert.equal(Number(count.rows[0]!.c), 1);
      const holds = (await listLedgerForIntent(q, deal.intent.id)).filter(
        (e) => e.entryType === "ESCROW_HOLD"
      );
      assert.equal(holds.length, 1);
    });
  }

  // —— 15 crash-after-inbox recovery ——
  for (let i = 0; i < 15; i++) {
    it(`crash after PENDING inbox recovers #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`crash-${i}`, 91000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const inbox = new WebhookInboxRepository(q);
      await inbox.insertPending({
        stripeEventId: built.event.id,
        eventType: built.event.type,
        stripeObjectId: deal.stripePaymentIntentId,
        payloadHash: hashWebhookPayload(built.rawBody),
        livemode: false,
      });
      const pending = await inbox.getByStripeEventId(built.event.id);
      assert.equal(pending?.status, "PENDING");
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.ok(
        res.outcome === "processed" || res.outcome === "duplicate"
      );
      const after = await inbox.getByStripeEventId(built.event.id);
      assert.equal(after?.status, "PROCESSED");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAID");
    });
  }

  // —— 15 environment / livemode ——
  for (let i = 0; i < 10; i++) {
    it(`livemode required rejects test events #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`live-${i}`, 92000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        livemode: false,
      });
      const proc = createStripeWebhookProcessor({
        db: q,
        webhookSecret: TEST_WHSEC,
        requireLivemode: true,
      });
      const res = await proc.handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "failed_reconciliation");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAYMENT_PENDING");
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`unknown event type → 200 noop #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`unk-${i}`, 93000 + i);
      const built = buildPiEvent({
        type: "charge.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      assert.equal(res.outcome, "ignored_unknown_type");
      assert.equal((await txRepo.getById(deal.txId))!.status, "PAYMENT_PENDING");
    });
  }

  // —— 10 privacy ——
  for (let i = 0; i < 10; i++) {
    it(`response privacy no secrets #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`priv-${i}`, 94000 + i);
      const built = buildPiEvent({
        type: "payment_intent.processing",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
        status: "processing",
      });
      const res = await processor().handleRawWebhook({
        rawBody: built.rawBody,
        signatureHeader: built.signature,
      });
      const json = JSON.stringify(res);
      assert.doesNotMatch(json, /whsec_|sk_live|sk_test|client_secret/);
      assert.equal(res.stripeWebhooksVersion, "1.0");
      WebhookHandleResultSchema.parse(res);
    });
  }

  it("verifyStripeWebhookSignature accepts valid header", () => {
    const built = buildPiEvent({
      type: "payment_intent.processing",
      piId: "pi_x",
      amount: 1000,
    });
    const ev = verifyStripeWebhookSignature({
      rawBody: built.rawBody,
      signatureHeader: built.signature,
      webhookSecret: TEST_WHSEC,
    });
    assert.equal(ev.id, built.event.id);
  });

  it("payload hash is sha256 hex", () => {
    const buf = Buffer.from("abc", "utf8");
    assert.equal(
      hashWebhookPayload(buf),
      createHash("sha256").update(buf).digest("hex")
    );
  });

  it("canceled maps to FAILED", async () => {
    const deal = await setupAuthorizingDeal("cancel-1", 95000);
    const built = buildPiEvent({
      type: "payment_intent.canceled",
      piId: deal.stripePaymentIntentId,
      amount: deal.offerCents,
      status: "canceled",
    });
    const res = await processor().handleRawWebhook({
      rawBody: built.rawBody,
      signatureHeader: built.signature,
    });
    assert.equal(res.outcome, "processed");
    const intent = await new PaymentRepository(q).getByTransactionId(deal.txId);
    assert.equal(intent!.status, "FAILED");
  });

  for (let i = 0; i < 6; i++) {
    it(`missing signature rejected #${i}`, async () => {
      const deal = await setupAuthorizingDeal(`nosig-${i}`, 96000 + i);
      const built = buildPiEvent({
        type: "payment_intent.succeeded",
        piId: deal.stripePaymentIntentId,
        amount: deal.offerCents,
      });
      await assert.rejects(
        () =>
          processor().handleRawWebhook({
            rawBody: built.rawBody,
            signatureHeader: undefined,
          }),
        (e: unknown) => e instanceof StripeWebhookSignatureError
      );
    });
  }
});

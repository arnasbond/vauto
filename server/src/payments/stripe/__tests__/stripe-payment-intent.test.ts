/**
 * Stage 11F.2 — Stripe PaymentIntent Integration (180+ tests).
 * FakeStripeAdapter only — 0 live network calls.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  FinancialReconciliationError,
  PaymentAuthError,
  PaymentNotFoundError,
  PaymentRepository,
} from "../../../payment/index.js";
import {
  STRIPE_INTEGRATION_VERSION,
  STRIPE_PI_MIGRATION_SQL,
  CreateStripeIntentBodySchema,
  StripeSafeClientResponseSchema,
  FakeStripeAdapter,
  stripeIdempotencyKeyForCreate,
  createTestStripePaymentIntentService,
  StripeProviderError,
  StripeProviderTimeoutError,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("11F.2 Stripe PaymentIntent Integration", () => {
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
    await db.exec(LISTINGS_STUB);
    q = adaptPglite(db);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    await db?.close();
  });

  async function seedListing(id: string, title: string, priceEuro: number) {
    await q.query(
      `INSERT INTO listings (id, title, price, image, attributes, status)
       VALUES ($1,$2,$3,'https://img.example/a.jpg','{"t":1}'::jsonb,'active')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price`,
      [id, title, priceEuro]
    );
  }

  async function setupAgreed(tag: string, offerCents = 95000) {
    const listingId = `L-${tag}`;
    await seedListing(listingId, `Skelbimas ${tag}`, 1100);
    const buyerId = `buyer-${tag}`;
    const sellerId = `seller-${tag}`;
    const tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 1100,
    });
    const created = await offers.create({
      transactionId: tx.id,
      actorUserId: buyerId,
      amountCents: offerCents,
      idempotencyKey: key(`c-${tag}`),
    });
    const accepted = await offers.accept({
      offerId: created.offer.id,
      actorUserId: sellerId,
      idempotencyKey: key(`a-${tag}`),
      expectedVersion: created.offer.version,
    });
    const fake = new FakeStripeAdapter();
    const { service } = createTestStripePaymentIntentService(q, fake);
    return {
      tx: accepted.transaction,
      buyerId,
      sellerId,
      offerCents,
      service,
      fake,
    };
  }

  it("exports stripeIntegrationVersion 1.0", () => {
    assert.equal(STRIPE_INTEGRATION_VERSION, "1.0");
  });

  it("migration 045 adds stripe columns", () => {
    const sql = readFileSync(
      path.resolve(
        __dirname,
        "../../../../migrations/045_stripe_payment_intents_1.0.sql"
      ),
      "utf8"
    );
    assert.match(sql, /stripe_payment_intent_id/);
    assert.match(sql, /stripe_client_secret/);
    assert.match(sql, /provider_status/);
    assert.match(sql, /uq_vauto_payment_intents_stripe_id/);
  });

  // —— 35 create & reuse ——
  for (let i = 0; i < 35; i++) {
    it(`create & reuse #${i}`, async () => {
      const { tx, buyerId, service, fake, offerCents } = await setupAgreed(
        `cr-${i}`,
        80000 + i
      );
      const a = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`cr-${i}`) },
      });
      assert.equal(a.amountCents, offerCents);
      assert.equal(a.currency, "EUR");
      assert.equal(a.status, "AUTHORIZING");
      assert.equal(a.stripeIntegrationVersion, "1.0");
      assert.ok(a.clientSecret.startsWith("pi_fake_"));
      assert.ok(a.stripePaymentIntentId.startsWith("pi_fake_"));
      StripeSafeClientResponseSchema.parse(a);
      const callsAfterFirst = fake.getCreateCallCount();
      const b = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`cr-reuse-${i}`) },
      });
      assert.equal(b.stripePaymentIntentId, a.stripePaymentIntentId);
      assert.equal(b.clientSecret, a.clientSecret);
      assert.equal(b.idempotentReplay, true);
      assert.equal(fake.getCreateCallCount(), callsAfterFirst);
      const live = (await txRepo.getById(tx.id))!;
      assert.equal(live.status, "PAYMENT_PENDING");
      assert.notEqual(live.status, "PAID");
    });
  }

  // —— 25 financial authority & reconciliation ——
  for (let i = 0; i < 25; i++) {
    it(`financial authority snapshot cents #${i}`, async () => {
      const cents = 70000 + i * 41;
      const { tx, buyerId, service, fake } = await setupAgreed(`fa-${i}`, cents);
      const res = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`fa-${i}`) },
      });
      assert.equal(res.amountCents, cents);
      assert.equal(fake.getCreateCallCount(), 1);
      const row = await q.query<{ amount_cents: number }>(
        `SELECT amount_cents FROM vauto_payment_intents WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(row.rows[0]!.amount_cents), cents);
      const snap = await q.query<{ amount_cents: number }>(
        `SELECT amount_cents FROM vauto_deal_snapshots WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(snap.rows[0]!.amount_cents), cents);
    });
  }

  it("reconciliation mismatch fail-closed before Stripe", async () => {
    const { tx, buyerId, service, fake, offerCents } = await setupAgreed(
      "fa-mismatch",
      91000
    );
    await q.query(
      `UPDATE vauto_offers SET amount_cents = $1 WHERE id IN (
         SELECT accepted_offer_id FROM vauto_deal_snapshots WHERE transaction_id = $2
       )`,
      [offerCents + 500, tx.id]
    );
    await assert.rejects(
      () =>
        service.createStripePaymentIntent({
          transactionId: tx.id,
          actorUserId: buyerId,
          body: { idempotencyKey: key("fa-mm") },
        }),
      (e: unknown) => e instanceof FinancialReconciliationError
    );
    assert.equal(fake.getCreateCallCount(), 0);
  });

  // —— 25 idempotency & concurrent ——
  for (let i = 0; i < 15; i++) {
    it(`idempotent sequential create #${i}`, async () => {
      const { tx, buyerId, service, fake } = await setupAgreed(`id-${i}`, 66000 + i);
      const idem = key(`id-${i}`);
      const a = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: idem },
      });
      const b = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: idem },
      });
      assert.equal(a.stripePaymentIntentId, b.stripePaymentIntentId);
      assert.equal(fake.getCreateCallCount(), 1);
      const count = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_payment_intents WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(count.rows[0]!.c), 1);
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`concurrent create → exactly 1 VAUTO + 1 Stripe #${i}`, async () => {
      const { tx, buyerId, service, fake, offerCents } = await setupAgreed(
        `conc-${i}`,
        55000 + i
      );
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, j) =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: { idempotencyKey: key(`conc-${i}-${j}`) },
          })
        )
      );
      const ids = new Set(results.map((r) => r.stripePaymentIntentId));
      assert.equal(ids.size, 1);
      assert.ok(results.every((r) => r.amountCents === offerCents));
      const count = await q.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM vauto_payment_intents WHERE transaction_id = $1`,
        [tx.id]
      );
      assert.equal(Number(count.rows[0]!.c), 1);
      assert.ok(fake.getCreateCallCount() >= 1);
      assert.ok(fake.getCreateCallCount() <= 10);
    });
  }

  // —— 20 provider error mapping ——
  for (let i = 0; i < 10; i++) {
    it(`provider API error mapping #${i}`, async () => {
      const { tx, buyerId, service, fake } = await setupAgreed(`err-${i}`, 42000 + i);
      fake.configure({ failNextCreates: 1 });
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: { idempotencyKey: key(`err-${i}`) },
          }),
        (e: unknown) => e instanceof StripeProviderError && e.httpStatus === 502
      );
      // VAUTO intent may exist as CREATED without stripe attach
      const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
      if (intent) {
        assert.equal(intent.stripePaymentIntentId, null);
        assert.notEqual(intent.status, "PAID");
      }
    });
  }

  for (let i = 0; i < 10; i++) {
    it(`provider timeout mapping #${i}`, async () => {
      const { tx, buyerId, service, fake } = await setupAgreed(`to-${i}`, 43000 + i);
      fake.configure({ timeoutNextCreates: 1 });
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: { idempotencyKey: key(`to-${i}`) },
          }),
        (e: unknown) => e instanceof StripeProviderTimeoutError
      );
    });
  }

  // —— 20 IDOR / buyer-only ——
  for (let i = 0; i < 20; i++) {
    it(`IDOR stranger/seller blocked #${i}`, async () => {
      const { tx, buyerId, sellerId, service, fake } = await setupAgreed(
        `idor-${i}`,
        48000 + i
      );
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: `stranger-${i}`,
            body: { idempotencyKey: key(`idor-s-${i}`) },
          }),
        (e: unknown) =>
          e instanceof PaymentAuthError || e instanceof PaymentNotFoundError
      );
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: sellerId,
            body: { idempotencyKey: key(`idor-sell-${i}`) },
          }),
        (e: unknown) => e instanceof PaymentAuthError
      );
      assert.equal(fake.getCreateCallCount(), 0);
      const ok = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`idor-ok-${i}`) },
      });
      assert.ok(ok.stripePaymentIntentId);
    });
  }

  // —— 20 crash recovery ——
  for (let i = 0; i < 20; i++) {
    it(`crash between Stripe and TX2 recovered #${i}`, async () => {
      const { tx, buyerId, service, fake, offerCents } = await setupAgreed(
        `crash-${i}`,
        61000 + i
      );
      const clientKey = key(`crash-c-${i}`);
      const created = await service.tx1OnlyForTests({
        transactionId: tx.id,
        actorUserId: buyerId,
        clientIdempotencyKey: clientKey,
      });
      assert.equal(created.status, "CREATED");
      assert.equal(created.stripePaymentIntentId, null);

      // Simulate Stripe succeeded before TX2
      const stripeKey = stripeIdempotencyKeyForCreate(created.id);
      const providerPi = await fake.createPaymentIntent({
        amountCents: offerCents,
        currency: "eur",
        idempotencyKey: stripeKey,
        metadata: {
          vautoPaymentIntentId: created.id,
          vautoTransactionId: tx.id,
          vautoDealSnapshotId: created.dealSnapshotId,
          buyerId,
          sellerId: created.sellerId,
          acceptedOfferId: "offer-x",
        },
      });
      fake.resetCallCount();

      const recovered = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: clientKey },
      });
      assert.equal(recovered.stripePaymentIntentId, providerPi.id);
      assert.equal(recovered.clientSecret, providerPi.clientSecret);
      assert.equal(recovered.amountCents, offerCents);
      assert.equal(recovered.status, "AUTHORIZING");
      // Idempotent Stripe create (same key) — one more adapter call that replays
      assert.equal(fake.getCreateCallCount(), 1);
    });
  }

  // —— 15 client payload tampering → 400 (Zod) ——
  const tamperBodies = [
    { idempotencyKey: "abcdefgh", amountCents: 1 },
    { idempotencyKey: "abcdefgh", amount: 99 },
    { idempotencyKey: "abcdefgh", currency: "USD" },
    { idempotencyKey: "abcdefgh", sellerId: "x" },
    { idempotencyKey: "abcdefgh", status: "PAID" },
    { idempotencyKey: "abcdefgh", snapshotId: "s" },
    { idempotencyKey: "abcdefgh", dealSnapshotId: "d" },
    { idempotencyKey: "abcdefgh", buyerId: "b" },
    { idempotencyKey: "abcdefgh", clientSecret: "sec" },
    { idempotencyKey: "abcdefgh", stripePaymentIntentId: "pi_x" },
    { idempotencyKey: "abcdefgh", amount_cents: 2 },
    { idempotencyKey: "abcdefgh", transactionId: "t" },
    { amountCents: 1 },
    {},
    { idempotencyKey: "short" },
  ];
  for (let i = 0; i < 15; i++) {
    it(`client tampering rejected #${i}`, async () => {
      assert.throws(() => CreateStripeIntentBodySchema.parse(tamperBodies[i]));
      const { tx, buyerId, service, fake } = await setupAgreed(`tamp-${i}`, 50000);
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: tx.id,
            actorUserId: buyerId,
            body: tamperBodies[i],
          }),
        (e: unknown) => e instanceof Error
      );
      assert.equal(fake.getCreateCallCount(), 0);
    });
  }

  // —— 10 privacy / no raw secrets ——
  for (let i = 0; i < 10; i++) {
    it(`safe response privacy #${i}`, async () => {
      const { tx, buyerId, service } = await setupAgreed(`priv-${i}`, 52000 + i);
      const res = await service.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`priv-${i}`) },
      });
      const keys = Object.keys(res).sort();
      assert.deepEqual(keys, [
        "amountCents",
        "clientSecret",
        "currency",
        "idempotentReplay",
        "status",
        "stripeIntegrationVersion",
        "stripePaymentIntentId",
      ].sort());
      const json = JSON.stringify(res);
      assert.doesNotMatch(json, /sk_live|sk_test|whsec_/);
      assert.doesNotMatch(json, /"charges"|"raw"|"webhookSecret"/);
      assert.equal(res.currency, "EUR");
      StripeSafeClientResponseSchema.parse(res);
    });
  }

  it("FakeStripeAdapter is used in tests (0 Real Stripe)", async () => {
    const { fake } = await setupAgreed("fake-check", 53000);
    assert.equal(fake.name, "fake");
  });

  it("stripe create does not mark PAID or HELD_IN_ESCROW", async () => {
    const { tx, buyerId, service } = await setupAgreed("no-paid", 54000);
    const res = await service.createStripePaymentIntent({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { idempotencyKey: key("no-paid") },
    });
    assert.equal(res.status, "AUTHORIZING");
    const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
    assert.equal(intent!.status, "AUTHORIZING");
    assert.notEqual(intent!.status, "HELD_IN_ESCROW");
    assert.notEqual(intent!.status, "RELEASED_TO_SELLER");
    const live = (await txRepo.getById(tx.id))!;
    assert.equal(live.status, "PAYMENT_PENDING");
  });

  it("derived Stripe idempotency key format", () => {
    assert.equal(
      stripeIdempotencyKeyForCreate("abc-123"),
      "vauto:payment-intent:abc-123:create"
    );
  });

  for (let i = 0; i < 5; i++) {
    it(`unknown transaction → not found #${i}`, async () => {
      const fake = new FakeStripeAdapter();
      const { service } = createTestStripePaymentIntentService(q, fake);
      await assert.rejects(
        () =>
          service.createStripePaymentIntent({
            transactionId: `missing-tx-${i}`,
            actorUserId: `buyer-m-${i}`,
            body: { idempotencyKey: key(`miss-${i}`) },
          }),
        (e: unknown) =>
          e instanceof PaymentNotFoundError || e instanceof PaymentAuthError
      );
      assert.equal(fake.getCreateCallCount(), 0);
    });
  }
});

/**
 * Stage 11G.2 — Delivery authority & payout eligibility suite (150+ tests).
 * FakeCarrierAdapter only — 0 live network. PGlite + optional real Postgres 16.
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
  OFFERS_MIGRATION_SQL,
  OfferEngine,
} from "../../transaction/offers/index.js";
import { TRANSACTION_CHAT_MIGRATION_SQL } from "../../transaction-chat/index.js";
import { DEAL_ROOM_MIGRATION_SQL } from "../../deal-room/index.js";
import {
  PAYMENT_LEDGER_MIGRATION_SQL,
  PaymentRepository,
  listLedgerForIntent,
} from "../../payment/index.js";
import {
  STRIPE_PI_MIGRATION_SQL,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
  createTestStripePaymentIntentService,
  createStripeWebhookProcessor,
  generateTestStripeSignatureHeader,
} from "../../payments/stripe/index.js";
import {
  FUNDS_TRANSFER_MIGRATION_SQL,
  REFUND_PENDING_MIGRATION_SQL,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL,
  createTestFundsTransferService,
} from "../../payments/transfer/index.js";
import {
  DELIVERY_INTEGRATION_VERSION,
  DELIVERY_MIGRATION_SQL,
  DELIVERY_HARDENING_MIGRATION_SQL,
  DURABLE_RELEASE_MIGRATION_SQL,
  STALE_RELEASE_RECOVERY_MIGRATION_SQL,
  DeliveryResponseSchema,
  DeliveryAuthError,
  DeliveryReleaseBlockedError,
  DeliveryCarrierUnavailableError,
  FakeCarrierAdapter,
  ProductionFailClosedCarrier,
  assertCarrierUsableInEnvironment,
  createTestDeliveryService,
  isMonotonicDeliveryTransition,
  SellerReleaseJobRepository,
  processSellerReleaseJobs,
  MAX_SELLER_RELEASE_ATTEMPTS,
  type DeliveryCarrier,
  type ReleaseFundsPort,
} from "../index.js";

const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
const USE_REAL_PG = Boolean(TEST_URL);
const TEST_WHSEC = "whsec_test_vauto_11g2_delivery";

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

const CARRIERS: DeliveryCarrier[] = [
  "OMNIVA",
  "DPD",
  "LP_EXPRESS",
  "DIRECT_COURIER",
];

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

describe("11G.3 Delivery Finality & Durable Release", () => {
  let pool: pg.Pool | null = null;
  let pglite: PGlite | null = null;
  let q: TxQueryable;
  let txRepo: TransactionRepository;
  let offers: OfferEngine;
  let seq = 0;
  const key = (p: string) => `${p}-idem-${++seq}-${Date.now()}`;

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
      const clients = await Promise.all([
        pool.connect(),
        pool.connect(),
        pool.connect(),
        pool.connect(),
      ]);
      assert.equal(clients.length, 4);
      for (const c of clients) c.release();
      q = createPoolTxQueryableFromPool(pool) as TxQueryable;
    } else {
      pglite = new PGlite();
      q = adaptPglite(pglite);
    }
    await applySql(TRANSACTION_MIGRATION_SQL);
    await applySql(OFFERS_MIGRATION_SQL);
    await applySql(TRANSACTION_CHAT_MIGRATION_SQL);
    await applySql(DEAL_ROOM_MIGRATION_SQL);
    await applySql(PAYMENT_LEDGER_MIGRATION_SQL);
    await applySql(STRIPE_PI_MIGRATION_SQL);
    await applySql(STRIPE_WEBHOOKS_MIGRATION_SQL);
    await applySql(FUNDS_TRANSFER_MIGRATION_SQL);
    await applySql(REFUND_PENDING_MIGRATION_SQL);
    await applySql(IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL);
    await applySql(DELIVERY_MIGRATION_SQL);
    await applySql(DELIVERY_HARDENING_MIGRATION_SQL);
    await applySql(DURABLE_RELEASE_MIGRATION_SQL);
    await applySql(STALE_RELEASE_RECOVERY_MIGRATION_SQL);
    await applySql(LISTINGS_STUB);
    txRepo = new TransactionRepository(q);
    offers = new OfferEngine(q);
  });

  after(async () => {
    if (pool) await pool.end();
    if (pglite) await pglite.close();
  });

  async function seedListing(id: string, sellerId = `seller-${id}`) {
    const usersTbl = await q.query<{ t: string | null }>(
      `SELECT to_regclass('public.users')::text AS t`
    );
    if (usersTbl.rows[0]?.t) {
      await q.query(
        `INSERT INTO users (id, name, phone, city)
         VALUES ($1,'11G seller','+37060000000','Vilnius')
         ON CONFLICT (id) DO NOTHING`,
        [sellerId]
      );
    }
    await q.query(
      `INSERT INTO listings (id, seller_id, title, price, location, image, attributes, status, category)
       VALUES ($1,$2,'T',100,'LT','https://img.example/a.jpg','{}'::jsonb,'active','electronics')
       ON CONFLICT (id) DO NOTHING`,
      [id, sellerId]
    );
  }

  /** DISCUSSION → … → PAID via SYSTEM (no Stripe). */
  async function setupPaid(tag: string) {
    const listingId = `L-${tag}-${randomUUID().slice(0, 8)}`;
    await seedListing(listingId, `seller-${tag}`);
    const buyerId = `buyer-${tag}`;
    const sellerId = `seller-${tag}`;
    let tx = await txRepo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
    });
    const steps: Array<{
      to: "OFFER_PENDING" | "NEGOTIATING" | "AGREED" | "PAYMENT_PENDING" | "PAID";
      actor: "BUYER" | "SELLER" | "SYSTEM";
      actorId: string;
      reason:
        | "OFFER_SUBMITTED"
        | "COUNTER_OFFER"
        | "OFFER_ACCEPTED"
        | "PAYMENT_REQUESTED"
        | "PAYMENT_CONFIRMED";
    }> = [
      {
        to: "OFFER_PENDING",
        actor: "BUYER",
        actorId: buyerId,
        reason: "OFFER_SUBMITTED",
      },
      {
        to: "NEGOTIATING",
        actor: "SELLER",
        actorId: sellerId,
        reason: "COUNTER_OFFER",
      },
      {
        to: "AGREED",
        actor: "BUYER",
        actorId: buyerId,
        reason: "OFFER_ACCEPTED",
      },
      {
        to: "PAYMENT_PENDING",
        actor: "SYSTEM",
        actorId: "SYSTEM",
        reason: "PAYMENT_REQUESTED",
      },
      {
        to: "PAID",
        actor: "SYSTEM",
        actorId: "SYSTEM",
        reason: "PAYMENT_CONFIRMED",
      },
    ];
    for (const s of steps) {
      tx = (
        await txRepo.executeTransition({
          transactionId: tx.id,
          toStatus: s.to,
          actorType: s.actor,
          actorId: s.actorId,
          reasonCode: s.reason,
          expectedVersion: tx.version,
          idempotencyKey: key(`${s.to}-${tag}`),
        })
      ).transaction;
    }
    const { service, fake } = createTestDeliveryService(q);
    return { txId: tx.id, buyerId, sellerId, service, fake, tx };
  }

  /** PAID + HELD escrow for 11F.4 release after confirm. */
  async function setupPaidHeld(tag: string, offerCents = 100000) {
    const listingId = `L-${tag}-${randomUUID().slice(0, 8)}`;
    await seedListing(listingId, `seller-${tag}`);
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
    const { service: stripeSvc, fake: stripeFake } =
      createTestStripePaymentIntentService(q);
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
    await createStripeWebhookProcessor({
      db: q,
      webhookSecret: TEST_WHSEC,
      requireLivemode: false,
    }).handleRawWebhook({
      rawBody: Buffer.from(payload, "utf8"),
      signatureHeader: generateTestStripeSignatureHeader({
        payload,
        secret: TEST_WHSEC,
      }),
    });
    const live = (await txRepo.getById(tx.id))!;
    assert.equal(live.status, "PAID");
    const { service: funds } = createTestFundsTransferService(q, {
      fake: stripeFake,
      sellerAccounts: { [sellerId]: `acct_fake_${tag}` },
    });
    let releaseCalls = 0;
    const releasePort: ReleaseFundsPort = {
      async releaseToSeller(input) {
        releaseCalls += 1;
        const r = await funds.releaseToSeller(input);
        return { transferStatus: r.transferStatus, status: r.status };
      },
    };
    const { service, fake } = createTestDeliveryService(q, { releasePort });
    const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
    return {
      txId: tx.id,
      buyerId,
      sellerId,
      service,
      fake,
      funds,
      intent: intent!,
      offerCents,
      getReleaseCalls: () => releaseCalls,
    };
  }

  /** C-01: label stays SHIPPING_PENDING; physical scan → SHIPPED. */
  async function labelAndShip(
    ctx: {
      txId: string;
      sellerId: string;
      service: ReturnType<typeof createTestDeliveryService>["service"];
      fake: FakeCarrierAdapter;
    },
    tag: string,
    carrier: DeliveryCarrier = "OMNIVA",
    trackingCode?: string
  ) {
    const labeled = await ctx.service.createLabel({
      transactionId: ctx.txId,
      actorUserId: ctx.sellerId,
      body: {
        idempotencyKey: key(`${tag}-lbl`),
        carrier,
        ...(trackingCode ? { trackingCode } : {}),
      },
    });
    assert.equal(labeled.transactionStatus, "SHIPPING_PENDING");
    assert.equal(labeled.delivery.status, "LABEL_CREATED");
    ctx.fake.setNextTrackingStatus("IN_TRANSIT");
    const shipped = await ctx.service.syncCarrierStatus({
      transactionId: ctx.txId,
      actorUserId: ctx.sellerId,
      body: { idempotencyKey: key(`${tag}-ship`) },
    });
    assert.equal(shipped.transactionStatus, "SHIPPED");
    assert.equal(shipped.delivery.status, "IN_TRANSIT");
    return labeled;
  }

  it("exports deliveryIntegrationVersion 1.2", () => {
    assert.equal(DELIVERY_INTEGRATION_VERSION, "1.2");
  });

  it("M-01 monotonic ranks reject DELIVERED → IN_TRANSIT", () => {
    assert.equal(isMonotonicDeliveryTransition("DELIVERED", "IN_TRANSIT"), false);
    assert.equal(isMonotonicDeliveryTransition("LABEL_CREATED", "IN_TRANSIT"), true);
    assert.equal(isMonotonicDeliveryTransition("IN_TRANSIT", "DELIVERED"), true);
  });

  it("H-01/H-03 production fail-closed rejects Fake", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      assert.throws(
        () => assertCarrierUsableInEnvironment(new FakeCarrierAdapter()),
        (e: unknown) => e instanceof DeliveryCarrierUnavailableError
      );
      assert.throws(
        () => assertCarrierUsableInEnvironment(new ProductionFailClosedCarrier()),
        (e: unknown) => e instanceof DeliveryCarrierUnavailableError
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  // —— 30 C-01 label → SHIPPING_PENDING (never SHIPPED) ——
  for (let i = 0; i < 30; i++) {
    it(`C-01 label → SHIPPING_PENDING only #${i}`, async () => {
      const carrier = CARRIERS[i % CARRIERS.length]!;
      const ctx = await setupPaid(`lbl-${i}`);
      const res = await ctx.service.createLabel({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: {
          idempotencyKey: key(`lbl-${i}`),
          carrier,
          terminalId: i % 2 === 0 ? `TERM-${i}` : null,
        },
      });
      assert.equal(res.transactionStatus, "SHIPPING_PENDING");
      assert.notEqual(res.transactionStatus, "SHIPPED");
      assert.equal(res.delivery.carrier, carrier);
      assert.ok(res.delivery.trackingCode.length >= 4);
      assert.equal(res.delivery.status, "LABEL_CREATED");
      DeliveryResponseSchema.parse(res);
      const again = await ctx.service.createLabel({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: {
          idempotencyKey: key(`lbl-again-${i}`),
          carrier,
        },
      });
      assert.equal(again.idempotentReplay, true);
      assert.equal(again.delivery.trackingCode, res.delivery.trackingCode);
      assert.equal(again.transactionStatus, "SHIPPING_PENDING");
    });
  }

  // —— 30 buyer confirm + 11F.4 release (after physical scan) ——
  for (let i = 0; i < 30; i++) {
    it(`confirmDelivery triggers release after scan #${i}`, async () => {
      const ctx = await setupPaidHeld(`cnf-${i}`, 88000 + i);
      await labelAndShip(ctx, `cnf-${i}`, CARRIERS[i % CARRIERS.length]!);
      const conf = await ctx.service.confirmDelivery({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`cnf-${i}`) },
      });
      assert.equal(conf.transactionStatus, "DELIVERED");
      assert.equal(conf.delivery.status, "DELIVERED");
      assert.equal(conf.releaseTriggered, true);
      assert.equal(conf.releaseTransferStatus, "TRANSFERRED");
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.ok(ledger.some((e) => e.entryType === "SELLER_TRANSFERRED"));
      const replay = await ctx.service.confirmDelivery({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: key(`cnf-r-${i}`) },
      });
      assert.equal(replay.idempotentReplay, true);
    });
  }

  // —— 25 carrier sync IN_TRANSIT → DELIVERED ——
  for (let i = 0; i < 25; i++) {
    it(`carrier sync physical scan then DELIVERED #${i}`, async () => {
      const ctx = await setupPaidHeld(`car-${i}`, 87000 + i);
      const labeled = await ctx.service.createLabel({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: {
          idempotencyKey: key(`car-lbl-${i}`),
          carrier: "OMNIVA",
        },
      });
      assert.equal(labeled.transactionStatus, "SHIPPING_PENDING");
      ctx.fake.setNextTrackingStatus(
        i % 2 === 0 ? "IN_TRANSIT" : "CARRIER_ACCEPTED"
      );
      const mid = await ctx.service.syncCarrierStatus({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: { idempotencyKey: key(`car-mid-${i}`) },
      });
      assert.equal(mid.delivery.status, "IN_TRANSIT");
      assert.equal(mid.transactionStatus, "SHIPPED");

      ctx.fake.markDelivered(labeled.delivery.trackingCode);
      const done = await ctx.service.syncCarrierStatus({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: { idempotencyKey: key(`car-done-${i}`) },
      });
      assert.equal(done.transactionStatus, "DELIVERED");
      assert.equal(done.delivery.status, "DELIVERED");
      assert.equal(done.releaseTriggered, true);
    });
  }

  // —— 20 IDOR ——
  for (let i = 0; i < 20; i++) {
    it(`IDOR rejected #${i}`, async () => {
      const ctx = await setupPaid(`idor-${i}`);
      await assert.rejects(
        () =>
          ctx.service.createLabel({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: {
              idempotencyKey: key(`idor-b-${i}`),
              carrier: "DPD",
            },
          }),
        (e: unknown) => e instanceof DeliveryAuthError
      );
      await assert.rejects(
        () =>
          ctx.service.createLabel({
            transactionId: ctx.txId,
            actorUserId: `stranger-${i}`,
            body: {
              idempotencyKey: key(`idor-s-${i}`),
              carrier: "DPD",
            },
          }),
        (e: unknown) => e instanceof DeliveryAuthError
      );
      await labelAndShip(ctx, `idor-ok-${i}`, "LP_EXPRESS");
      await assert.rejects(
        () =>
          ctx.service.confirmDelivery({
            transactionId: ctx.txId,
            actorUserId: ctx.sellerId,
            body: { idempotencyKey: key(`idor-c-${i}`) },
          }),
        (e: unknown) => e instanceof DeliveryAuthError
      );
      await assert.rejects(
        () =>
          ctx.service.getTracking({
            transactionId: ctx.txId,
            actorUserId: `stranger-${i}`,
          }),
        (e: unknown) => e instanceof DeliveryAuthError
      );
    });
  }

  // —— 20 duplicate confirm idempotency ——
  for (let i = 0; i < 20; i++) {
    it(`duplicate confirm idempotent #${i}`, async () => {
      const ctx = await setupPaidHeld(`dup-${i}`, 86000 + i);
      await labelAndShip(ctx, `dup-${i}`, "OMNIVA", `MANUAL${i}TRACK`);
      const idem = key(`dup-c-${i}`);
      const a = await ctx.service.confirmDelivery({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: idem },
      });
      const b = await ctx.service.confirmDelivery({
        transactionId: ctx.txId,
        actorUserId: ctx.buyerId,
        body: { idempotencyKey: idem },
      });
      assert.equal(a.transactionStatus, "DELIVERED");
      assert.equal(b.idempotentReplay, true);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
      const blocked = await ctx.service.createLabel({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: {
          idempotencyKey: key(`dup-bad-${i}`),
          carrier: "DPD",
        },
      });
      assert.equal(blocked.idempotentReplay, true);
      assert.equal(blocked.delivery.trackingCode, "MANUAL" + i + "TRACK");
    });
  }

  // —— 10 concurrent sync + confirm → exactly 1 DELIVERED / 1 release ——
  for (let i = 0; i < 10; i++) {
    it(`race sync+confirm exactly-once release #${i}`, async () => {
      const ctx = await setupPaidHeld(`race-${i}`, 85000 + i);
      const labeled = await labelAndShip(ctx, `race-${i}`);
      ctx.fake.markDelivered(labeled.delivery.trackingCode);
      const settled = await Promise.allSettled([
        ctx.service.syncCarrierStatus({
          transactionId: ctx.txId,
          actorUserId: ctx.sellerId,
          body: { idempotencyKey: key(`race-sync-${i}`) },
        }),
        ctx.service.confirmDelivery({
          transactionId: ctx.txId,
          actorUserId: ctx.buyerId,
          body: { idempotencyKey: key(`race-cnf-${i}`) },
        }),
      ]);
      const fulfilled = settled.filter((s) => s.status === "fulfilled");
      assert.ok(fulfilled.length >= 1);
      const live = (await txRepo.getById(ctx.txId))!;
      assert.equal(live.status, "DELIVERED");
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
      // Port may be invoked once (winner) or briefly raced; ledger is the authority.
      assert.ok(ctx.getReleaseCalls() >= 1);
      const job = await new SellerReleaseJobRepository(q).getByTransactionId(
        ctx.txId
      );
      assert.ok(job);
      assert.ok(
        job!.status === "COMPLETED" ||
          job!.status === "PENDING" ||
          job!.status === "PROCESSING"
      );
    });
  }

  // —— 15 H-02 eligibility blocks (0 releases) ——
  for (let i = 0; i < 5; i++) {
    it(`H-02 confirm blocked by open DISPUTE #${i}`, async () => {
      const ctx = await setupPaidHeld(`disp-${i}`, 84000 + i);
      await labelAndShip(ctx, `disp-${i}`);
      const shipped = (await txRepo.getById(ctx.txId))!;
      await txRepo.executeTransition({
        transactionId: ctx.txId,
        toStatus: "DISPUTED",
        actorType: "BUYER",
        actorId: ctx.buyerId,
        reasonCode: "DISPUTE_OPENED",
        expectedVersion: shipped.version,
        idempotencyKey: key(`disp-open-${i}`),
      });
      await assert.rejects(
        () =>
          ctx.service.confirmDelivery({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`disp-c-${i}`) },
          }),
        (e: unknown) =>
          e instanceof DeliveryReleaseBlockedError ||
          (e instanceof Error && e.message.includes("DISPUTED"))
      );
      assert.equal(ctx.getReleaseCalls(), 0);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        0
      );
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`H-02 confirm blocked by REFUND_PENDING #${i}`, async () => {
      const ctx = await setupPaidHeld(`refp-${i}`, 83000 + i);
      await labelAndShip(ctx, `refp-${i}`);
      await q.query(
        `UPDATE vauto_payment_intents
         SET transfer_status = 'REFUND_PENDING', status = 'REFUND_PENDING', updated_at = NOW()
         WHERE id = $1`,
        [ctx.intent.id]
      );
      await assert.rejects(
        () =>
          ctx.service.confirmDelivery({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`refp-c-${i}`) },
          }),
        (e: unknown) => e instanceof DeliveryReleaseBlockedError
      );
      assert.equal(ctx.getReleaseCalls(), 0);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        0
      );
    });
  }

  for (let i = 0; i < 5; i++) {
    it(`H-02 confirm blocked by SYSTEM_FINANCIAL_LOCK #${i}`, async () => {
      const ctx = await setupPaidHeld(`flock-${i}`, 82000 + i);
      await labelAndShip(ctx, `flock-${i}`);
      await q.query(
        `UPDATE vauto_payment_intents
         SET transfer_status = 'TRANSFER_BLOCKED', updated_at = NOW()
         WHERE id = $1`,
        [ctx.intent.id]
      );
      await assert.rejects(
        () =>
          ctx.service.confirmDelivery({
            transactionId: ctx.txId,
            actorUserId: ctx.buyerId,
            body: { idempotencyKey: key(`flock-c-${i}`) },
          }),
        (e: unknown) =>
          e instanceof DeliveryReleaseBlockedError && e.httpStatus === 403
      );
      assert.equal(ctx.getReleaseCalls(), 0);
      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        0
      );
    });
  }

  // —— 11G.3 H-01 durable release after network failures ——
  for (let i = 0; i < 5; i++) {
    it(`H-01 durable release retries after 3 network errors #${i}`, async () => {
      await seedListing(`L-dur-${i}`);
      const buyerId = `buyer-dur-${i}`;
      const sellerId = `seller-dur-${i}`;
      const offerCents = 81000 + i;
      const tx = await txRepo.create({
        listingId: `L-dur-${i}`,
        buyerId,
        sellerId,
        currentPrice: 100,
      });
      const created = await offers.create({
        transactionId: tx.id,
        actorUserId: buyerId,
        amountCents: offerCents,
        idempotencyKey: key(`dur-c-${i}`),
      });
      await offers.accept({
        offerId: created.offer.id,
        actorUserId: sellerId,
        idempotencyKey: key(`dur-a-${i}`),
        expectedVersion: created.offer.version,
      });
      const { service: stripeSvc, fake: stripeFake } =
        createTestStripePaymentIntentService(q);
      const stripeRes = await stripeSvc.createStripePaymentIntent({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`dur-s-${i}`) },
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
      await createStripeWebhookProcessor({
        db: q,
        webhookSecret: TEST_WHSEC,
        requireLivemode: false,
      }).handleRawWebhook({
        rawBody: Buffer.from(payload, "utf8"),
        signatureHeader: generateTestStripeSignatureHeader({
          payload,
          secret: TEST_WHSEC,
        }),
      });
      const { service: funds } = createTestFundsTransferService(q, {
        fake: stripeFake,
        sellerAccounts: { [sellerId]: `acct_fake_dur_${i}` },
      });
      let networkFails = 0;
      const flakyPort: ReleaseFundsPort = {
        async releaseToSeller(input) {
          networkFails += 1;
          if (networkFails <= 3) {
            throw new Error(`simulated_network_error_${networkFails}`);
          }
          const r = await funds.releaseToSeller(input);
          return { transferStatus: r.transferStatus, status: r.status };
        },
      };
      const { service, fake } = createTestDeliveryService(q, {
        releasePort: flakyPort,
      });
      const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
      await labelAndShip(
        { txId: tx.id, sellerId, service, fake },
        `dur-${i}`
      );
      const conf = await service.confirmDelivery({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`dur-cnf-${i}`) },
      });
      assert.equal(conf.transactionStatus, "DELIVERED");
      const jobRepo = new SellerReleaseJobRepository(q);
      let job = await jobRepo.getByTransactionId(tx.id);
      assert.ok(job, "durable release job must exist after DELIVERED");
      // First immediate attempt fails; job stays PENDING for retry.
      assert.ok(
        job!.status === "PENDING" || job!.status === "PROCESSING",
        `expected PENDING/PROCESSING after network fail, got ${job!.status}`
      );
      assert.ok(networkFails >= 1);

      // Simulate 3 consecutive network failures then success via worker drain.
      while (networkFails < 3) {
        await processSellerReleaseJobs(q, flakyPort, {
          limit: 5,
          forceImmediate: true,
        });
        job = await jobRepo.getByTransactionId(tx.id);
      }
      assert.ok(networkFails >= 3);
      assert.notEqual(job!.status, "COMPLETED");

      for (let attempt = 0; attempt < 8 && job!.status !== "COMPLETED"; attempt++) {
        await processSellerReleaseJobs(q, flakyPort, {
          limit: 5,
          forceImmediate: true,
        });
        job = await jobRepo.getByTransactionId(tx.id);
      }
      assert.equal(job!.status, "COMPLETED");
      assert.ok(networkFails >= 4);
      const ledger = await listLedgerForIntent(q, intent!.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );

      // Replay confirm keeps job; no second transfer.
      const replay = await service.confirmDelivery({
        transactionId: tx.id,
        actorUserId: buyerId,
        body: { idempotencyKey: key(`dur-r-${i}`) },
      });
      assert.equal(replay.idempotentReplay, true);
      const ledger2 = await listLedgerForIntent(q, intent!.id);
      assert.equal(
        ledger2.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
    });
  }

  // —— 11G.3 H-02 skip-state SHIPPING_PENDING → SHIPPED → DELIVERED ——
  for (let i = 0; i < 5; i++) {
    it(`H-02 carrier DELIVERED skip-state from SHIPPING_PENDING #${i}`, async () => {
      const ctx = await setupPaidHeld(`skip-${i}`, 80000 + i);
      const labeled = await ctx.service.createLabel({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: {
          idempotencyKey: key(`skip-lbl-${i}`),
          carrier: "OMNIVA",
        },
      });
      assert.equal(labeled.transactionStatus, "SHIPPING_PENDING");
      assert.equal(labeled.delivery.status, "LABEL_CREATED");

      ctx.fake.markDelivered(labeled.delivery.trackingCode);
      const done = await ctx.service.syncCarrierStatus({
        transactionId: ctx.txId,
        actorUserId: ctx.sellerId,
        body: { idempotencyKey: key(`skip-sync-${i}`) },
        authoritySource: "carrier_webhook",
      });
      assert.equal(done.transactionStatus, "DELIVERED");
      assert.equal(done.delivery.status, "DELIVERED");

      const events = await txRepo.listEvents(ctx.txId);
      const toShipped = events.filter((e) => e.toStatus === "SHIPPED");
      const toDelivered = events.filter((e) => e.toStatus === "DELIVERED");
      assert.equal(toShipped.length, 1);
      assert.equal(toDelivered.length, 1);

      const job = await new SellerReleaseJobRepository(q).getByTransactionId(
        ctx.txId
      );
      assert.ok(job);
      assert.ok(
        job!.status === "COMPLETED" || job!.status === "PENDING",
        `expected release job, got ${job!.status}`
      );
      assert.equal(
        (
          await q.query(
            `SELECT COUNT(*)::int AS c FROM seller_release_jobs WHERE transaction_id = $1`,
            [ctx.txId]
          )
        ).rows[0]!.c,
        1
      );

      const ledger = await listLedgerForIntent(q, ctx.intent.id);
      assert.equal(
        ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
        1
      );
    });
  }

  // —— 11G.4 stale lease reclaim + max retries ——
  it("11G.4 crash recovery: stale PROCESSING reclaimed then COMPLETED", async () => {
    const ctx = await setupPaidHeld("stale-lease", 79000);
    await labelAndShip(ctx, "stale-lease");

    const alwaysFail: ReleaseFundsPort = {
      async releaseToSeller() {
        throw new Error("pre_crash_network");
      },
    };
    const { service: failSvc } = createTestDeliveryService(q, {
      releasePort: alwaysFail,
      fake: ctx.fake,
    });
    await failSvc.confirmDelivery({
      transactionId: ctx.txId,
      actorUserId: ctx.buyerId,
      body: { idempotencyKey: key("stale-cnf") },
    });

    const jobRepo = new SellerReleaseJobRepository(q);
    let job = await jobRepo.getByTransactionId(ctx.txId);
    assert.ok(job);
    assert.ok(job!.status === "PENDING" || job!.status === "PROCESSING");

    await q.query(
      `UPDATE seller_release_jobs
       SET status = 'PROCESSING',
           processing_started_at = NOW() - INTERVAL '10 minutes',
           completed_at = NULL,
           updated_at = NOW() - INTERVAL '10 minutes'
       WHERE transaction_id = $1`,
      [ctx.txId]
    );
    assert.equal((await jobRepo.getByTransactionId(ctx.txId))!.status, "PROCESSING");

    const realPort: ReleaseFundsPort = {
      async releaseToSeller(input) {
        const r = await ctx.funds.releaseToSeller(input);
        return { transferStatus: r.transferStatus, status: r.status };
      },
    };
    const batch = await processSellerReleaseJobs(q, realPort, {
      limit: 200,
      forceImmediate: true,
    });
    assert.ok(batch.reclaimed >= 1);
    job = await jobRepo.getByTransactionId(ctx.txId);
    assert.equal(job!.status, "COMPLETED");
    const ledger = await listLedgerForIntent(q, ctx.intent.id);
    assert.equal(
      ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
      1
    );
  });

  it("11G.4 max retries: 12 failures → FAILED (no further retry)", async () => {
    const ctx = await setupPaidHeld("max-retry", 78000);
    await labelAndShip(ctx, "max-retry");

    const alwaysFail: ReleaseFundsPort = {
      async releaseToSeller() {
        throw new Error("permanent_network_failure");
      },
    };
    const { service: failSvc } = createTestDeliveryService(q, {
      releasePort: alwaysFail,
      fake: ctx.fake,
    });
    await failSvc.confirmDelivery({
      transactionId: ctx.txId,
      actorUserId: ctx.buyerId,
      body: { idempotencyKey: key("max-cnf") },
    });

    const jobRepo = new SellerReleaseJobRepository(q);
    for (let i = 0; i < MAX_SELLER_RELEASE_ATTEMPTS + 3; i++) {
      const current = await jobRepo.getByTransactionId(ctx.txId);
      if (current?.status === "FAILED") break;
      if (current) await jobRepo.forceAvailableNow(current.id);
      await processSellerReleaseJobs(q, alwaysFail, {
        limit: 200,
        forceImmediate: true,
      });
    }

    const job = await jobRepo.getByTransactionId(ctx.txId);
    assert.equal(job!.status, "FAILED");
    assert.ok(job!.attempts >= MAX_SELLER_RELEASE_ATTEMPTS);

    const again = await processSellerReleaseJobs(q, alwaysFail, {
      limit: 5,
      forceImmediate: true,
    });
    assert.equal(again.processed, 0);
    assert.equal((await jobRepo.getByTransactionId(ctx.txId))!.status, "FAILED");
    const ledger = await listLedgerForIntent(q, ctx.intent.id);
    assert.equal(
      ledger.filter((e) => e.entryType === "SELLER_TRANSFERRED").length,
      0
    );
  });
});

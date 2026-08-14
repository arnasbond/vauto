/**
 * Shared harness for 11F.5/11F.6 financial reconciliation / red-team tests.
 * Prefers real postgres:16 via TEST_DATABASE_URL + pg.Pool({ max: 4 });
 * falls back to PGlite when unset.
 */

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
} from "../../payment/index.js";
import {
  STRIPE_PI_MIGRATION_SQL,
  STRIPE_WEBHOOKS_MIGRATION_SQL,
  createTestStripePaymentIntentService,
  createStripeWebhookProcessor,
  generateTestStripeSignatureHeader,
  FakeStripeAdapter,
} from "../stripe/index.js";
import {
  FUNDS_TRANSFER_MIGRATION_SQL,
  REFUND_PENDING_MIGRATION_SQL,
  IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL,
} from "../transfer/index.js";
import { createTestFundsTransferService } from "../transfer/index.js";
import type { ProviderLookup, ProviderMirror } from "../reconciliation/index.js";
import { createFakeStripeProviderLookup } from "../reconciliation/stripe-provider-lookup.js";

export const TEST_WHSEC = "whsec_test_vauto_11f5_recon";
export const TEST_URL = process.env.TEST_DATABASE_URL?.trim() || "";
export const USE_REAL_PG = Boolean(TEST_URL);

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

export function adaptPglite(db: PGlite): TxQueryable {
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

export type FinancialDbHandle = {
  q: TxQueryable;
  txRepo: TransactionRepository;
  offers: OfferEngine;
  pool: pg.Pool | null;
  pglite: PGlite | null;
  close: () => Promise<void>;
};

async function applyMigrationSql(
  handle: { pool: pg.Pool | null; pglite: PGlite | null },
  sql: string
): Promise<void> {
  if (handle.pool) {
    const client = await handle.pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
    return;
  }
  await handle.pglite!.exec(sql);
}

export async function bootFinancialDb(): Promise<FinancialDbHandle> {
  let pool: pg.Pool | null = null;
  let pglite: PGlite | null = null;
  let q: TxQueryable;

  if (USE_REAL_PG) {
    pool = new pg.Pool({
      connectionString: TEST_URL,
      max: 4,
    });
    const clients = await Promise.all([
      pool.connect(),
      pool.connect(),
      pool.connect(),
      pool.connect(),
    ]);
    if (clients.length !== 4) {
      throw new Error("Expected pg.Pool max>=4 concurrent clients");
    }
    for (const c of clients) c.release();
    q = createPoolTxQueryableFromPool(pool) as TxQueryable;
  } else {
    pglite = new PGlite();
    q = adaptPglite(pglite);
  }

  const handle = { pool, pglite };
  await applyMigrationSql(handle, TRANSACTION_MIGRATION_SQL);
  await applyMigrationSql(handle, OFFERS_MIGRATION_SQL);
  await applyMigrationSql(handle, TRANSACTION_CHAT_MIGRATION_SQL);
  await applyMigrationSql(handle, DEAL_ROOM_MIGRATION_SQL);
  await applyMigrationSql(handle, PAYMENT_LEDGER_MIGRATION_SQL);
  await applyMigrationSql(handle, STRIPE_PI_MIGRATION_SQL);
  await applyMigrationSql(handle, STRIPE_WEBHOOKS_MIGRATION_SQL);
  await applyMigrationSql(handle, FUNDS_TRANSFER_MIGRATION_SQL);
  await applyMigrationSql(handle, REFUND_PENDING_MIGRATION_SQL);
  await applyMigrationSql(handle, IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL);
  await applyMigrationSql(handle, LISTINGS_STUB);

  return {
    q,
    txRepo: new TransactionRepository(q),
    offers: new OfferEngine(q),
    pool,
    pglite,
    async close() {
      if (pool) await pool.end();
      if (pglite) await pglite.close();
    },
  };
}

let seq = 0;
export const key = (p: string) => `${p}-idem-${++seq}-${Date.now()}`;

/** M-02 — filter transfers/refunds by transactionId + paymentIntentId / stripe PI. */
export function providerLookupFromFake(
  fake: FakeStripeAdapter
): ProviderLookup {
  return createFakeStripeProviderLookup(fake);
}

export async function setupHeldDelivered(
  q: TxQueryable,
  txRepo: TransactionRepository,
  offers: OfferEngine,
  tag: string,
  offerCents = 100000
) {
  await q.query(
    `INSERT INTO listings (id, title, price, image, attributes, status)
     VALUES ($1,'T',100,'https://img.example/a.jpg','{}'::jsonb,'active')
     ON CONFLICT (id) DO NOTHING`,
    [`L-${tag}`]
  );
  const buyerId = `buyer-${tag}`;
  const sellerId = `seller-${tag}`;
  const tx = await txRepo.create({
    listingId: `L-${tag}`,
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

  const { service: stripeSvc, fake } = createTestStripePaymentIntentService(q);
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
  await createStripeWebhookProcessor({
    db: q,
    webhookSecret: TEST_WHSEC,
    requireLivemode: false,
  }).handleRawWebhook({
    rawBody: Buffer.from(payload, "utf8"),
    signatureHeader: signature,
  });

  let live = (await txRepo.getById(tx.id))!;
  for (const step of [
    {
      to: "SHIPPING_PENDING" as const,
      actor: "SELLER" as const,
      actorId: sellerId,
      reason: "SHIPMENT_READY" as const,
    },
    {
      to: "SHIPPED" as const,
      actor: "SELLER" as const,
      actorId: sellerId,
      reason: "SHIPPED_CONFIRMED" as const,
    },
    {
      to: "DELIVERED" as const,
      actor: "BUYER" as const,
      actorId: buyerId,
      reason: "DELIVERY_CONFIRMED" as const,
    },
  ]) {
    live = (
      await txRepo.executeTransition({
        transactionId: live.id,
        toStatus: step.to,
        actorType: step.actor,
        actorId: step.actorId,
        reasonCode: step.reason,
        expectedVersion: live.version,
        idempotencyKey: key(`${step.to}-${tag}`),
      })
    ).transaction;
  }

  const { service: funds } = createTestFundsTransferService(q, {
    fake,
    sellerAccounts: { [sellerId]: `acct_fake_${tag}` },
  });

  const intent = await new PaymentRepository(q).getByTransactionId(tx.id);
  return {
    txId: tx.id,
    buyerId,
    sellerId,
    offerCents,
    fake,
    funds,
    intent: intent!,
    stripePaymentIntentId: stripeRes.stripePaymentIntentId,
  };
}

/** Helper unused import keep for type-only ProviderMirror consumers. */
export type { ProviderMirror };

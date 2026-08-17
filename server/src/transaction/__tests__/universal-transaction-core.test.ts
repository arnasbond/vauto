/**
 * Stage 11J / 11J.1 — Universal Transaction Core (policy-driven, multi-vertical).
 * Legacy GOODS + CARRIER_DELIVERY must remain 11A–11I compatible.
 */

import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  InvalidPolicyCompositionError,
  IdempotencyConflictError,
  InvalidTransitionError,
  PolicyForbiddenError,
  TRANSACTION_MIGRATION_SQL,
  TransactionRepository,
  UNIVERSAL_CORE_11J1_MIGRATION_SQL,
  UNIVERSAL_CORE_11J2_MIGRATION_SQL,
  UNIVERSAL_CORE_11J3_MIGRATION_SQL,
  UNIVERSAL_CORE_MIGRATION_SQL,
  type ActorType,
  type ReasonCode,
  type TransactionStatus,
  type TxQueryable,
  type VautoTransaction,
} from "../index.js";
import {
  REPUTATION_MIGRATION_SQL,
  createReputationService,
} from "../../reputation/index.js";
import {
  FinancialCapExceededError,
  FinancialObligationRepository,
  ObligationLimitError,
  ProviderEventReplayError,
  ProviderMetadataMismatchError,
  UntrustedProviderProvenanceError,
  createFinancialObligationService,
} from "../../payments/ledger/index.js";
import {
  applyTrustedProviderProvenance,
  generateTestStripeSignatureHeader,
  isSignatureVerifiedStripeEvent,
  mintTrustedProviderProvenanceFromSignedWebhook,
  StripeWebhookSignatureError,
} from "../../payments/stripe/webhooks/index.js";
import { mintTrustedProviderProvenanceFromVerifiedStripeEvent } from "../../payments/stripe/webhooks/trusted-provider-provenance.js";
import type Stripe from "stripe";
import { ServiceRemotePolicy } from "../policies/service-remote-policy.js";

const TEST_WHSEC = "whsec_test_vauto_11j4_provenance_boundary";
const SERVER_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

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

function mintSignedStripeProvenance(input: {
  eventId: string;
  paymentIntentId: string;
  amountCents: number;
  transactionId: string;
  currency?: string;
}) {
  const currency = (input.currency ?? "eur").toLowerCase();
  const event = {
    id: input.eventId,
    object: "event",
    api_version: "2024-11-20.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: input.paymentIntentId,
        object: "payment_intent",
        amount: input.amountCents,
        currency,
        status: "succeeded",
        metadata: {},
      },
    },
  };
  const payload = JSON.stringify(event);
  return mintTrustedProviderProvenanceFromSignedWebhook({
    rawBody: Buffer.from(payload, "utf8"),
    signatureHeader: generateTestStripeSignatureHeader({
      payload,
      secret: TEST_WHSEC,
    }),
    webhookSecret: TEST_WHSEC,
    localTransactionId: input.transactionId,
    localAmountCents: input.amountCents,
    localCurrency: currency,
    localStripePaymentIntentId: input.paymentIntentId,
  });
}

async function verifyWithSignedStripeEvent(
  db: TxQueryable,
  input: {
    eventId: string;
    paymentIntentId: string;
    amountCents: number;
    transactionId: string;
    obligationId?: string;
    currency?: string;
  }
) {
  const trusted = mintSignedStripeProvenance(input);
  return applyTrustedProviderProvenance(
    db,
    trusted,
    input.obligationId ? { obligationId: input.obligationId } : undefined
  );
}

function listProductionTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "__tests__") {
      continue;
    }
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listProductionTsFiles(full));
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

const GOODS_HAPPY: Array<{
  to: TransactionStatus;
  actor: ActorType;
  reason: ReasonCode;
}> = [
  { to: "OFFER_PENDING", actor: "BUYER", reason: "OFFER_SUBMITTED" },
  { to: "NEGOTIATING", actor: "SELLER", reason: "COUNTER_OFFER" },
  { to: "AGREED", actor: "BUYER", reason: "OFFER_ACCEPTED" },
  { to: "PAYMENT_PENDING", actor: "SYSTEM", reason: "PAYMENT_REQUESTED" },
  { to: "PAID", actor: "SYSTEM", reason: "PAYMENT_CONFIRMED" },
  { to: "SHIPPING_PENDING", actor: "SELLER", reason: "SHIPMENT_READY" },
  { to: "SHIPPED", actor: "SELLER", reason: "SHIPPED_CONFIRMED" },
  { to: "DELIVERED", actor: "BUYER", reason: "DELIVERY_CONFIRMED" },
  { to: "COMPLETED", actor: "SYSTEM", reason: "COMPLETION_CONFIRMED" },
];

describe("11J Universal Transaction Core", () => {
  let db: PGlite;
  let q: TxQueryable;
  let repo: TransactionRepository;
  let n = 0;

  before(async () => {
    db = new PGlite();
    await db.exec(TRANSACTION_MIGRATION_SQL);
    await db.exec(REPUTATION_MIGRATION_SQL);
    await db.exec(UNIVERSAL_CORE_MIGRATION_SQL);
    await db.exec(UNIVERSAL_CORE_11J1_MIGRATION_SQL);
    await db.exec(UNIVERSAL_CORE_11J2_MIGRATION_SQL);
    await db.exec(UNIVERSAL_CORE_11J3_MIGRATION_SQL);
    q = adaptPglite(db);
    repo = new TransactionRepository(q);
  });

  after(async () => {
    await db?.close();
  });

  function ids(prefix: string) {
    const k = `${prefix}-${++n}-${randomUUID().slice(0, 8)}`;
    return {
      listingId: `L-${k}`,
      buyerId: `buyer-${k}`,
      sellerId: `seller-${k}`,
    };
  }

  async function step(
    tx: VautoTransaction,
    to: TransactionStatus,
    actorType: ActorType,
    actorId: string,
    reasonCode: ReasonCode
  ): Promise<VautoTransaction> {
    const res = await repo.executeTransition({
      transactionId: tx.id,
      expectedVersion: tx.version,
      toStatus: to,
      actorType,
      actorId,
      reasonCode,
      idempotencyKey: `idem-${tx.id}-${to}-${tx.version}-${randomUUID().slice(0, 8)}`,
    });
    return res.transaction;
  }

  it("Test 1: Legacy GOODS + CARRIER_DELIVERY matches 11A–11I happy path", async () => {
    const { listingId, buyerId, sellerId } = ids("legacy");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
    });
    assert.equal(tx.vertical, "GOODS");
    assert.equal(tx.fulfillmentType, "CARRIER_DELIVERY");
    assert.equal(tx.paymentMode, "FULL_ESCROW");
    assert.equal(tx.status, "DISCUSSION");
    assert.equal(tx.platformManagedAmountCents, 10_000);

    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "PAID",
          actorType: "SYSTEM",
          actorId: "sys",
          reasonCode: "PAYMENT_CONFIRMED",
          idempotencyKey: `idem-illegal-${tx.id}`,
        }),
      InvalidTransitionError
    );

    for (const s of GOODS_HAPPY) {
      const actorId =
        s.actor === "BUYER" ? buyerId : s.actor === "SELLER" ? sellerId : "system";
      tx = await step(tx, s.to, s.actor, actorId, s.reason);
    }
    assert.equal(tx.status, "COMPLETED");
    assert.equal(tx.fulfillmentType, "CARRIER_DELIVERY");

    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "PURCHASE_PRICE",
      amountCents: 10_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    await verifyWithSignedStripeEvent(q, {
      eventId: `evt_${tx.id}`,
      paymentIntentId: `pi_${tx.id}`,
      amountCents: 10_000,
      transactionId: tx.id,
      obligationId: held.id,
    });

    const reputation = createReputationService(q);
    const review = await reputation.submitReview({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { rating: 5, comment: "legacy goods" },
    });
    assert.equal(review.review.verificationLevel, "L1_PLATFORM_TRANSACTION");
  });

  it("Test 2: SERVICES + SERVICE_IN_PERSON requires customer confirm then L1 review", async () => {
    const { listingId, buyerId, sellerId } = ids("svc");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "FULL_ESCROW",
      verificationPolicy: "PLATFORM_TRANSACTION",
      contractValueCents: 50_000,
    });
    tx = await step(tx, "OFFER_PENDING", "BUYER", buyerId, "OFFER_SUBMITTED");
    tx = await step(tx, "AGREED", "BUYER", buyerId, "OFFER_ACCEPTED");
    tx = await step(tx, "SERVICE_SCHEDULED", "SELLER", sellerId, "SERVICE_SCHEDULED");
    tx = await step(tx, "SERVICE_PERFORMED", "SELLER", sellerId, "SERVICE_PERFORMED");
    tx = await step(tx, "CUSTOMER_CONFIRMED", "BUYER", buyerId, "CUSTOMER_CONFIRMED");
    tx = await step(tx, "COMPLETED", "BUYER", buyerId, "COMPLETION_CONFIRMED");
    assert.equal(tx.status, "COMPLETED");

    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 50_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    await verifyWithSignedStripeEvent(q, {
      eventId: `evt_${tx.id}`,
      paymentIntentId: `pi_${tx.id}`,
      amountCents: 50_000,
      transactionId: tx.id,
      obligationId: held.id,
    });

    const reputation = createReputationService(q);
    const review = await reputation.submitReview({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { rating: 4, comment: "service done" },
    });
    assert.equal(review.review.verificationLevel, "L1_PLATFORM_TRANSACTION");
  });

  it("Test 3: REAL_ESTATE + DIRECT_CONTACT → L2 review, never Verified Purchase", async () => {
    const { listingId, buyerId, sellerId } = ids("re");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "REAL_ESTATE",
      fulfillmentType: "DIRECT_CONTACT",
      paymentMode: "OFF_PLATFORM",
      verificationPolicy: "APPOINTMENT_VERIFIED",
    });
    tx = await step(tx, "CONTACT_ACCEPTED", "BUYER", buyerId, "CONTACT_ACCEPTED");
    tx = await step(tx, "INTERACTION_CLAIMED", "BUYER", buyerId, "INTERACTION_CLAIMED");
    tx = await step(
      tx,
      "INTERACTION_CONFIRMED",
      "SELLER",
      sellerId,
      "INTERACTION_CONFIRMED"
    );
    tx = await step(
      tx,
      "INTERACTION_COMPLETED",
      "SYSTEM",
      "system",
      "INTERACTION_COMPLETED"
    );
    assert.equal(tx.status, "INTERACTION_COMPLETED");
    assert.notEqual(tx.status, "COMPLETED");
    assert.notEqual(tx.status, "PAID");

    const reputation = createReputationService(q);
    const review = await reputation.submitReview({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { rating: 5, comment: "apžiūra įvyko" },
    });
    assert.equal(review.review.verificationLevel, "L2_INTERACTION");
    assert.notEqual(review.review.verificationLevel, "L1_PLATFORM_TRANSACTION");
  });

  it("Test 4: Partial escrow — ledger caps at 200 € of 1 000 € contract", async () => {
    const { listingId, buyerId, sellerId } = ids("dep");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    assert.equal(tx.contractValueCents, 100_000);
    assert.equal(tx.platformManagedAmountCents, 20_000);

    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    assert.equal(held.amountCents, 20_000);

    await assert.rejects(
      () =>
        ledger.createObligation({
          transactionId: tx.id,
          type: "PURCHASE_PRICE",
          amountCents: 80_000,
          payerId: buyerId,
          beneficiaryId: sellerId,
        }),
      ObligationLimitError
    );

    await assert.rejects(
      () =>
        ledger.refundObligation({
          transactionId: tx.id,
          sourceObligationId: held.id,
          amountCents: 20_001,
          actorUserId: buyerId,
        }),
      ObligationLimitError
    );

    const refunded = await ledger.refundObligation({
      transactionId: tx.id,
      sourceObligationId: held.id,
      amountCents: 20_000,
      actorUserId: buyerId,
    });
    assert.equal(refunded.amountCents, 20_000);
    assert.equal(refunded.type, "REFUND");
  });

  it("Test 5: Anti-collusion — provider cannot COMPLETED without customer (403)", async () => {
    const { listingId, buyerId, sellerId } = ids("col");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "FULL_ESCROW",
      contractValueCents: 10_000,
    });
    tx = await step(tx, "OFFER_PENDING", "BUYER", buyerId, "OFFER_SUBMITTED");
    tx = await step(tx, "AGREED", "BUYER", buyerId, "OFFER_ACCEPTED");
    tx = await step(tx, "SERVICE_SCHEDULED", "SELLER", sellerId, "SERVICE_SCHEDULED");
    tx = await step(tx, "SERVICE_PERFORMED", "SELLER", sellerId, "SERVICE_PERFORMED");

    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "COMPLETED",
          actorType: "SELLER",
          actorId: sellerId,
          reasonCode: "COMPLETION_CONFIRMED",
          idempotencyKey: `idem-collude-${tx.id}`,
        }),
      (e: unknown) =>
        e instanceof PolicyForbiddenError && e.httpStatus === 403
    );
    const live = await repo.getById(tx.id);
    assert.equal(live!.status, "SERVICE_PERFORMED");
    assert.equal(ServiceRemotePolicy.id, "SERVICE_REMOTE");
    assert.notEqual(ServiceRemotePolicy.id, "SERVICE_IN_PERSON");
  });

  it("Test A: Concurrent cap race — 2 × 200 € against 200 € cap", async () => {
    const { listingId, buyerId, sellerId } = ids("race-cap");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const ledger = createFinancialObligationService(q);
    const settled = await Promise.allSettled([
      ledger.createObligation({
        transactionId: tx.id,
        type: "SERVICE_DEPOSIT",
        amountCents: 20_000,
        payerId: buyerId,
        beneficiaryId: sellerId,
      }),
      ledger.createObligation({
        transactionId: tx.id,
        type: "SERVICE_DEPOSIT",
        amountCents: 20_000,
        payerId: buyerId,
        beneficiaryId: sellerId,
      }),
    ]);
    const ok = settled.filter((s) => s.status === "fulfilled");
    const bad = settled.filter((s) => s.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    assert.ok(
      bad[0]!.status === "rejected" &&
        bad[0].reason instanceof FinancialCapExceededError
    );
    const rows = await q.query<{ amount_cents: string | number }>(
      `SELECT amount_cents FROM vauto_financial_obligations
       WHERE transaction_id = $1 AND type <> 'REFUND'`,
      [tx.id]
    );
    const sum = rows.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
    assert.equal(sum, 20_000);
  });

  it("Test B: Concurrent refund race — exactly one refund row", async () => {
    const { listingId, buyerId, sellerId } = ids("race-ref");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    const settled = await Promise.allSettled([
      ledger.refundObligation({
        transactionId: tx.id,
        sourceObligationId: held.id,
        amountCents: 20_000,
        actorUserId: buyerId,
      }),
      ledger.refundObligation({
        transactionId: tx.id,
        sourceObligationId: held.id,
        amountCents: 20_000,
        actorUserId: buyerId,
      }),
    ]);
    const ok = settled.filter((s) => s.status === "fulfilled");
    assert.equal(ok.length, 1);
    const refunds = await q.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM vauto_financial_obligations
       WHERE transaction_id = $1 AND type = 'REFUND'`,
      [tx.id]
    );
    assert.equal(Number(refunds.rows[0]!.c), 1);
  });

  it("Test C: OFF_PLATFORM + PLATFORM_TRANSACTION is rejected", async () => {
    const { listingId, buyerId, sellerId } = ids("off-l1");
    await assert.rejects(
      () =>
        repo.create({
          listingId,
          buyerId,
          sellerId,
          vertical: "GOODS",
          fulfillmentType: "CARRIER_DELIVERY",
          paymentMode: "OFF_PLATFORM",
          verificationPolicy: "PLATFORM_TRANSACTION",
        }),
      (e: unknown) =>
        e instanceof InvalidPolicyCompositionError && e.httpStatus === 400
    );
  });

  it("Test D: Direct contact one-party farming cannot reach COMPLETED", async () => {
    const { listingId, buyerId, sellerId } = ids("farm");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "REAL_ESTATE",
      fulfillmentType: "DIRECT_CONTACT",
      paymentMode: "OFF_PLATFORM",
      verificationPolicy: "APPOINTMENT_VERIFIED",
    });
    tx = await step(tx, "CONTACT_ACCEPTED", "BUYER", buyerId, "CONTACT_ACCEPTED");
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "INTERACTION_COMPLETED",
          actorType: "BUYER",
          actorId: buyerId,
          reasonCode: "INTERACTION_COMPLETED",
          idempotencyKey: `idem-farm-complete-${tx.id}`,
        }),
      InvalidTransitionError
    );
    tx = await step(tx, "INTERACTION_CLAIMED", "BUYER", buyerId, "INTERACTION_CLAIMED");
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "INTERACTION_CONFIRMED",
          actorType: "BUYER",
          actorId: buyerId,
          reasonCode: "INTERACTION_CONFIRMED",
          idempotencyKey: `idem-farm-confirm-${tx.id}`,
        }),
      (e: unknown) => e instanceof PolicyForbiddenError
    );
    await assert.rejects(
      () =>
        repo.executeTransition({
          transactionId: tx.id,
          expectedVersion: tx.version,
          toStatus: "INTERACTION_COMPLETED",
          actorType: "BUYER",
          actorId: buyerId,
          reasonCode: "INTERACTION_COMPLETED",
          idempotencyKey: `idem-farm-skip-${tx.id}`,
        }),
      InvalidTransitionError
    );
    const live = await repo.getById(tx.id);
    assert.equal(live!.status, "INTERACTION_CLAIMED");
    assert.notEqual(live!.status, "INTERACTION_COMPLETED");
    assert.notEqual(live!.status, "COMPLETED");
  });

  it("Test E: REAL_ESTATE + CARRIER_DELIVERY is fail-closed", async () => {
    const { listingId, buyerId, sellerId } = ids("bad-comp");
    await assert.rejects(
      () =>
        repo.create({
          listingId,
          buyerId,
          sellerId,
          vertical: "REAL_ESTATE",
          fulfillmentType: "CARRIER_DELIVERY",
          paymentMode: "OFF_PLATFORM",
          verificationPolicy: "APPOINTMENT_VERIFIED",
        }),
      (e: unknown) =>
        e instanceof InvalidPolicyCompositionError && e.httpStatus === 400
    );
  });

  it("Test F: Unverified ledger HELD never yields L1", async () => {
    const { listingId, buyerId, sellerId } = ids("unverified");
    let tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
    });
    for (const s of GOODS_HAPPY) {
      const actorId =
        s.actor === "BUYER" ? buyerId : s.actor === "SELLER" ? sellerId : "system";
      tx = await step(tx, s.to, s.actor, actorId, s.reason);
    }
    const ledger = createFinancialObligationService(q);
    const unverified = await ledger.createObligation({
      transactionId: tx.id,
      type: "PURCHASE_PRICE",
      amountCents: 10_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    assert.equal(unverified.paymentProviderRef, null);
    assert.equal(unverified.providerVerifiedAt, null);

    const reputation = createReputationService(q);
    const review = await reputation.submitReview({
      transactionId: tx.id,
      actorUserId: buyerId,
      body: { rating: 5, comment: "internal hold only" },
    });
    assert.equal(review.review.verificationLevel, "L2_INTERACTION");
    assert.notEqual(review.review.verificationLevel, "L1_PLATFORM_TRANSACTION");
  });

  it("Test G: Atomic create idempotency fingerprint (replay vs 409)", async () => {
    const { listingId, buyerId, sellerId } = ids("idem-create");
    const key = `create-idem-${randomUUID()}`;
    const first = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
      idempotencyKey: key,
    });
    const replay = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
      idempotencyKey: key,
    });
    assert.equal(replay.id, first.id);
    await assert.rejects(
      () =>
        repo.create({
          listingId,
          buyerId,
          sellerId,
          currentPrice: 100,
          contractValueCents: 20_000,
          idempotencyKey: key,
        }),
      (e: unknown) =>
        e instanceof IdempotencyConflictError && e.httpStatus === 409
    );
  });

  it("Test H: Provider event replay cannot verify a second obligation", async () => {
    const a = ids("replay-a");
    const b = ids("replay-b");
    const txA = await repo.create({
      listingId: a.listingId,
      buyerId: a.buyerId,
      sellerId: a.sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const txB = await repo.create({
      listingId: b.listingId,
      buyerId: b.buyerId,
      sellerId: b.sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const ledger = createFinancialObligationService(q);
    const oblA = await ledger.createObligation({
      transactionId: txA.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: a.buyerId,
      beneficiaryId: a.sellerId,
    });
    const oblB = await ledger.createObligation({
      transactionId: txB.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: b.buyerId,
      beneficiaryId: b.sellerId,
    });
    const eventId = "evt_stripe_real_1";
    const first = await verifyWithSignedStripeEvent(q, {
      eventId,
      paymentIntentId: "pi_stripe_real_a",
      amountCents: 20_000,
      transactionId: txA.id,
      obligationId: oblA.id,
    });
    assert.ok(first?.providerVerifiedAt);

    await assert.rejects(
      () =>
        verifyWithSignedStripeEvent(q, {
          eventId,
          paymentIntentId: "pi_stripe_real_b",
          amountCents: 20_000,
          transactionId: txB.id,
          obligationId: oblB.id,
        }),
      (e: unknown) =>
        e instanceof ProviderEventReplayError && e.httpStatus === 409
    );
    const liveB = await q.query<{
      provider_verified_at: string | Date | null;
    }>(
      `SELECT provider_verified_at FROM vauto_financial_obligations WHERE id = $1`,
      [oblB.id]
    );
    assert.equal(liveB.rows[0]!.provider_verified_at, null);
  });

  it("Test I: Metadata mismatch / forgery leaves provider_verified_at NULL", async () => {
    const { listingId, buyerId, sellerId } = ids("forge");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      vertical: "SERVICES",
      fulfillmentType: "SERVICE_IN_PERSON",
      paymentMode: "DEPOSIT_ESCROW",
      contractValueCents: 100_000,
      platformManagedAmountCents: 20_000,
    });
    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "SERVICE_DEPOSIT",
      amountCents: 20_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });

    await assert.rejects(
      () =>
        verifyWithSignedStripeEvent(q, {
          eventId: "evt_forged_amount",
          paymentIntentId: "pi_forged",
          amountCents: 1,
          transactionId: tx.id,
          obligationId: held.id,
        }),
      (e: unknown) => e instanceof ProviderMetadataMismatchError
    );
    await assert.rejects(
      () =>
        verifyWithSignedStripeEvent(q, {
          eventId: "evt_forged_txn",
          paymentIntentId: "pi_forged",
          amountCents: 20_000,
          transactionId: "not-this-transaction",
          obligationId: held.id,
        }),
      (e: unknown) => e instanceof ProviderMetadataMismatchError
    );
    const live = await q.query<{
      provider_verified_at: string | Date | null;
    }>(
      `SELECT provider_verified_at FROM vauto_financial_obligations WHERE id = $1`,
      [held.id]
    );
    assert.equal(live.rows[0]!.provider_verified_at, null);
  });

  it("Test J: Fake provider provenance cannot set provider_verified_at", async () => {
    const { listingId, buyerId, sellerId } = ids("fake-prov");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
    });
    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "PURCHASE_PRICE",
      amountCents: 10_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    assert.equal(held.providerVerifiedAt, null);

    const publicLedger = ledger as unknown as Record<string, unknown>;
    assert.equal(
      typeof publicLedger.verifyObligationFromProvider,
      "undefined",
      "public ledger must not expose verifyObligationFromProvider"
    );
    assert.equal(
      typeof publicLedger.verifyObligationFromProviderInTx,
      "undefined"
    );

    if (typeof publicLedger.verifyObligationFromProvider === "function") {
      await (
        publicLedger.verifyObligationFromProvider as (input: unknown) => Promise<unknown>
      )({
        obligationId: held.id,
        paymentProvider: "STRIPE",
        paymentProviderRef: "pi_fake_exploit",
        providerEventId: "evt_fake_exploit",
        expectedTransactionId: tx.id,
        expectedAmountCents: 10_000,
        expectedCurrency: "EUR",
      });
    }

    const oblRepo = new FinancialObligationRepository(q);
    const repoAny = oblRepo as unknown as Record<string, unknown>;
    assert.equal(
      typeof repoAny.markProviderVerified,
      "undefined",
      "repository must not expose markProviderVerified"
    );
    if (typeof repoAny.markProviderVerified === "function") {
      await (
        repoAny.markProviderVerified as (input: unknown) => Promise<unknown>
      )({
        id: held.id,
        paymentProvider: "STRIPE",
        paymentProviderRef: "pi_fake_exploit",
        providerEventId: "evt_fake_exploit",
      });
    }

    await assert.rejects(
      () =>
        applyTrustedProviderProvenance(q, {
          paymentProvider: "STRIPE",
          paymentProviderRef: "pi_fake_exploit",
          providerEventId: "evt_fake_exploit",
          expectedTransactionId: tx.id,
          expectedAmountCents: 10_000,
          expectedCurrency: "EUR",
        }),
      (e: unknown) =>
        e instanceof UntrustedProviderProvenanceError && e.httpStatus === 403
    );

    assert.throws(
      () =>
        mintTrustedProviderProvenanceFromSignedWebhook({
          rawBody: Buffer.from(
            JSON.stringify({
              id: "evt_fake_unsigned",
              type: "payment_intent.succeeded",
              data: {
                object: {
                  id: "pi_fake_unsigned",
                  object: "payment_intent",
                  amount: 10_000,
                  currency: "eur",
                  status: "succeeded",
                },
              },
            }),
            "utf8"
          ),
          signatureHeader: "t=1,v1=deadbeef",
          webhookSecret: TEST_WHSEC,
          localTransactionId: tx.id,
          localAmountCents: 10_000,
          localCurrency: "EUR",
          localStripePaymentIntentId: "pi_fake_unsigned",
        }),
      (e: unknown) => e instanceof StripeWebhookSignatureError
    );

    const inserted = await oblRepo.insert({
      transactionId: tx.id,
      type: "PURCHASE_PRICE",
      amountCents: 1,
      payerId: buyerId,
      beneficiaryId: sellerId,
      status: "HELD",
      ...({
        paymentProviderRef: "pi_fake_insert",
        paymentProvider: "STRIPE",
        providerEventId: "evt_fake_insert",
        providerVerifiedAt: new Date().toISOString(),
      } as Record<string, unknown>),
    } as Parameters<typeof oblRepo.insert>[0]);
    assert.equal(inserted.providerVerifiedAt, null);
    assert.equal(inserted.providerEventId, null);
    assert.equal(inserted.paymentProviderRef, null);

    const live = await q.query<{
      provider_verified_at: string | Date | null;
    }>(
      `SELECT provider_verified_at FROM vauto_financial_obligations WHERE id = $1`,
      [held.id]
    );
    assert.equal(live.rows[0]!.provider_verified_at, null);

    const writerRel = path
      .join("payments", "stripe", "webhooks", "trusted-provider-provenance.ts")
      .replace(/\\/g, "/");
    const nowMutators: string[] = [];
    const leftoverPublicVerify: string[] = [];
    const leftoverMark: string[] = [];
    const verifiedMintImporters: string[] = [];
    for (const file of listProductionTsFiles(SERVER_SRC)) {
      const rel = path.relative(SERVER_SRC, file).replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (/provider_verified_at\s*=\s*NOW\s*\(/i.test(src)) {
        nowMutators.push(rel);
      }
      if (src.includes("verifyObligationFromProvider")) {
        leftoverPublicVerify.push(rel);
      }
      if (src.includes("markProviderVerified")) {
        leftoverMark.push(rel);
      }
      if (
        src.includes("mintTrustedProviderProvenanceFromVerifiedStripeEvent") &&
        rel !== writerRel
      ) {
        verifiedMintImporters.push(rel);
      }
    }
    assert.deepEqual(
      nowMutators,
      [writerRel],
      `provider_verified_at = NOW() must live only in ${writerRel}`
    );
    assert.deepEqual(
      leftoverPublicVerify,
      [],
      "verifyObligationFromProvider must not exist in production"
    );
    assert.deepEqual(
      leftoverMark,
      [],
      "markProviderVerified must not exist in production"
    );
    assert.deepEqual(
      verifiedMintImporters,
      ["payments/stripe/webhooks/webhook-processor.ts"],
      "constructEvent mint must only be used by StripeWebhookProcessor"
    );
  });

  it("Test K: Fake Stripe.Event POJO cannot mint provenance without constructEvent capability", async () => {
    const { listingId, buyerId, sellerId } = ids("fake-evt-cap");
    const tx = await repo.create({
      listingId,
      buyerId,
      sellerId,
      currentPrice: 100,
      contractValueCents: 10_000,
    });
    const ledger = createFinancialObligationService(q);
    const held = await ledger.createObligation({
      transactionId: tx.id,
      type: "PURCHASE_PRICE",
      amountCents: 10_000,
      payerId: buyerId,
      beneficiaryId: sellerId,
    });
    assert.equal(held.providerVerifiedAt, null);

    const stripePiId = `pi_real_shape_${tx.id.replace(/-/g, "").slice(0, 24)}`;
    const fakeEvent = {
      id: "evt_fake_runtime_capability",
      object: "event",
      api_version: "2024-11-20.acacia",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: stripePiId,
          object: "payment_intent",
          amount: 10_000,
          currency: "eur",
          status: "succeeded",
          metadata: {},
        },
      },
    } as Stripe.Event;

    assert.equal(isSignatureVerifiedStripeEvent(fakeEvent), false);

    assert.throws(
      () =>
        mintTrustedProviderProvenanceFromVerifiedStripeEvent(fakeEvent, {
          transactionId: tx.id,
          amountCents: 10_000,
          currency: "EUR",
          stripePaymentIntentId: stripePiId,
        }),
      (e: unknown) =>
        e instanceof UntrustedProviderProvenanceError && e.httpStatus === 403
    );

    const sigMod = await import(
      "../../payments/stripe/webhooks/signature-verifier.js"
    );
    const sigAny = sigMod as Record<string, unknown>;
    assert.equal(
      typeof sigAny.markStripeEventAsVerified,
      "undefined",
      "callers must not be able to register a verified Stripe event"
    );
    assert.equal(typeof sigAny.SIGNATURE_VERIFIED_STRIPE_EVENTS, "undefined");

    const live = await q.query<{
      provider_verified_at: string | Date | null;
    }>(
      `SELECT provider_verified_at FROM vauto_financial_obligations WHERE id = $1`,
      [held.id]
    );
    assert.equal(live.rows[0]!.provider_verified_at, null);

    const verifierRel = path
      .join("payments", "stripe", "webhooks", "signature-verifier.ts")
      .replace(/\\/g, "/");
    const addSites: string[] = [];
    const markSites: string[] = [];
    for (const file of listProductionTsFiles(SERVER_SRC)) {
      const rel = path.relative(SERVER_SRC, file).replace(/\\/g, "/");
      const src = readFileSync(file, "utf8");
      if (src.includes("SIGNATURE_VERIFIED_STRIPE_EVENTS.add")) {
        addSites.push(rel);
      }
      if (src.includes("markStripeEventAsVerified")) {
        markSites.push(rel);
      }
    }
    assert.deepEqual(
      addSites,
      [verifierRel],
      "only signature-verifier.ts may register constructEvent() results"
    );
    assert.deepEqual(markSites, [], "no public markStripeEventAsVerified");
  });
});

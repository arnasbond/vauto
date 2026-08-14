/**
 * Stage 11F.2 — 2-phase Stripe PaymentIntent create/reuse.
 * Stripe network calls NEVER run inside an open DB transaction.
 *
 * TX1 → COMMIT → Stripe API → TX2 → COMMIT
 * Creating a Stripe PI does NOT mean PAID / HELD_IN_ESCROW.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  FinancialReconciliationError,
  PaymentAuthError,
  PaymentNotFoundError,
  PaymentStateError,
  PaymentRepository,
  appendLedgerEntry,
  reconcileSnapshotAgainstAcceptedOffer,
  PAYMENT_LEDGER_VERSION,
  type PaymentIntent,
} from "../../payment/index.js";
import { CreateStripeIntentBodySchema } from "./schema.js";
import {
  createPaymentProvider,
  FakeStripeAdapter,
  stripeIdempotencyKeyForCreate,
} from "./stripe-adapter.js";
import { STRIPE_INTEGRATION_VERSION } from "./version.js";
import type {
  PaymentProvider,
  StripeSafeClientResponse,
} from "./types.js";
import { StripeProviderError } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const STRIPE_PI_MIGRATION_ID = "045_stripe_payment_intents_1.0";
export const STRIPE_PI_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/045_stripe_payment_intents_1.0.sql"
  ),
  "utf8"
);

const TX1_ALLOWED = new Set(["AGREED", "PAYMENT_PENDING"]);

function isUniqueViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /unique|duplicate|23505/i.test(msg) ||
    (typeof e === "object" &&
      e !== null &&
      "code" in e &&
      String((e as { code: unknown }).code) === "23505")
  );
}

function toSafeResponse(
  intent: PaymentIntent,
  idempotentReplay: boolean
): StripeSafeClientResponse {
  if (!intent.stripePaymentIntentId || !intent.stripeClientSecret) {
    throw new PaymentStateError("Stripe provider fields missing after attach");
  }
  return {
    clientSecret: intent.stripeClientSecret,
    stripePaymentIntentId: intent.stripePaymentIntentId,
    status: intent.status,
    amountCents: intent.amountCents,
    currency: "EUR",
    idempotentReplay,
    stripeIntegrationVersion: STRIPE_INTEGRATION_VERSION,
  };
}

export class StripePaymentIntentService {
  constructor(
    private readonly db: TxQueryable,
    private readonly provider: PaymentProvider
  ) {}

  /**
   * Buyer-only Stripe PaymentIntent create/reuse (2-phase).
   * Amount ALWAYS from snapshot cents via TX1 reconciliation.
   */
  async createStripePaymentIntent(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<StripeSafeClientResponse> {
    const body = CreateStripeIntentBodySchema.parse(input.body);

    // —— TX1: domain create / load (NO Stripe) ——
    const phase1 = await runQueryableTransaction(this.db, async (tx) => {
      return this.runTx1EnsureCreated(tx, {
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        clientIdempotencyKey: body.idempotencyKey,
      });
    });

    // Reuse active provider intent — no network call
    if (
      phase1.intent.stripePaymentIntentId &&
      phase1.intent.stripeClientSecret
    ) {
      return toSafeResponse(phase1.intent, true);
    }

    // —— External network (or Fake) OUTSIDE DB TX ——
    const stripeKey = stripeIdempotencyKeyForCreate(phase1.intent.id);
    const providerPi = await this.provider.createPaymentIntent({
      amountCents: phase1.intent.amountCents,
      currency: "eur",
      idempotencyKey: stripeKey,
      metadata: {
        vautoPaymentIntentId: phase1.intent.id,
        vautoTransactionId: phase1.intent.transactionId,
        vautoDealSnapshotId: phase1.intent.dealSnapshotId,
        buyerId: phase1.intent.buyerId,
        sellerId: phase1.intent.sellerId,
        acceptedOfferId: phase1.acceptedOfferId,
      },
    });

    // Defense: provider amount must match snapshot-derived cents
    if (providerPi.amountCents !== phase1.intent.amountCents) {
      throw new StripeProviderError(
        "Provider amount mismatch vs VAUTO snapshot cents",
        { code: "STRIPE_AMOUNT_MISMATCH", httpStatus: 502 }
      );
    }

    // —— TX2: attach provider ids → AUTHORIZING ——
    const attached = await runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const live = await intents.getById(phase1.intent.id);
      if (!live) throw new PaymentNotFoundError();

      if (live.stripePaymentIntentId && live.stripeClientSecret) {
        return live;
      }

      return intents.attachStripeProvider(tx, {
        id: live.id,
        expectedVersion: live.version,
        stripePaymentIntentId: providerPi.id,
        stripeClientSecret: providerPi.clientSecret,
        providerStatus: providerPi.status,
        toStatus: "AUTHORIZING",
      });
    });

    return toSafeResponse(attached, phase1.created === false);
  }

  /**
   * Test/crash-recovery helper: run TX1 only (simulate crash before Stripe/TX2).
   */
  async tx1OnlyForTests(input: {
    transactionId: string;
    actorUserId: string;
    clientIdempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const r = await this.runTx1EnsureCreated(tx, {
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        clientIdempotencyKey: input.clientIdempotencyKey,
      });
      return r.intent;
    });
  }

  private async runTx1EnsureCreated(
    tx: TxQueryable,
    input: {
      transactionId: string;
      actorUserId: string;
      clientIdempotencyKey: string;
    }
  ): Promise<{
    intent: PaymentIntent;
    acceptedOfferId: string;
    created: boolean;
  }> {
    const intents = new PaymentRepository(tx);
    const txRepo = new TransactionRepository(tx);

    const txn = await txRepo.getById(input.transactionId);
    if (!txn) throw new PaymentNotFoundError();
    if (txn.buyerId !== input.actorUserId) {
      throw new PaymentAuthError();
    }
    if (!TX1_ALLOWED.has(txn.status)) {
      throw new PaymentStateError(
        `Stripe PaymentIntent requires AGREED (or PAYMENT_PENDING); got ${txn.status}`
      );
    }

    const facts = await reconcileSnapshotAgainstAcceptedOffer(
      tx,
      input.transactionId
    );
    if (
      facts.buyerId !== txn.buyerId ||
      facts.sellerId !== txn.sellerId ||
      facts.buyerId !== input.actorUserId
    ) {
      throw new PaymentAuthError();
    }

    const existing = await intents.getByTransactionId(input.transactionId);
    if (existing) {
      // One active intent per deal — reuse (ignore differing client keys)
      if (existing.amountCents !== facts.snapshotAmountCents) {
        throw new FinancialReconciliationError(
          facts.snapshotAmountCents,
          existing.amountCents
        );
      }
      return {
        intent: existing,
        acceptedOfferId: facts.acceptedOfferId,
        created: false,
      };
    }

    let paymentIntent: PaymentIntent;
    try {
      paymentIntent = await intents.insertCreated({
        transactionId: input.transactionId,
        dealSnapshotId: facts.dealSnapshotId,
        buyerId: facts.buyerId,
        sellerId: facts.sellerId,
        amountCents: facts.snapshotAmountCents,
        idempotencyKey: input.clientIdempotencyKey,
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const raced = await intents.getByTransactionId(input.transactionId);
      if (!raced) throw e;
      return {
        intent: raced,
        acceptedOfferId: facts.acceptedOfferId,
        created: false,
      };
    }

    await appendLedgerEntry(tx, {
      paymentIntentId: paymentIntent.id,
      transactionId: input.transactionId,
      entryType: "DEBIT",
      amountCents: paymentIntent.amountCents,
      actorId: input.actorUserId,
      idempotencyKey: `ledger-debit-${input.clientIdempotencyKey}`,
      payloadJson: {
        event: "PAYMENT_INTENT_CREATED",
        via: "stripe_integration_11f2",
        dealSnapshotId: facts.dealSnapshotId,
        acceptedOfferId: facts.acceptedOfferId,
        paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
        stripeIntegrationVersion: STRIPE_INTEGRATION_VERSION,
      },
    });

    if (txn.status === "AGREED") {
      await txRepo.executeTransitionInTx(tx, {
        transactionId: txn.id,
        toStatus: "PAYMENT_PENDING",
        actorType: "BUYER",
        actorId: input.actorUserId,
        reasonCode: "PAYMENT_REQUESTED",
        expectedVersion: txn.version,
        idempotencyKey: `sm-pay-req-${input.clientIdempotencyKey}`,
        metadata: {
          paymentIntentId: paymentIntent.id,
          amountCents: paymentIntent.amountCents,
          stripeIntegrationVersion: STRIPE_INTEGRATION_VERSION,
        },
      });
    }

    return {
      intent: paymentIntent,
      acceptedOfferId: facts.acceptedOfferId,
      created: true,
    };
  }
}

export function createStripePaymentIntentService(
  db: TxQueryable,
  provider?: PaymentProvider
): StripePaymentIntentService {
  return new StripePaymentIntentService(
    db,
    provider ?? createPaymentProvider({ forceFake: !process.env.STRIPE_SECRET_KEY })
  );
}

export function createTestStripePaymentIntentService(
  db: TxQueryable,
  fake?: FakeStripeAdapter
): { service: StripePaymentIntentService; fake: FakeStripeAdapter } {
  const adapter = fake ?? (createPaymentProvider({ forceFake: true }) as FakeStripeAdapter);
  return {
    service: new StripePaymentIntentService(db, adapter),
    fake: adapter as FakeStripeAdapter,
  };
}

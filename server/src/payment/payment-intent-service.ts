/**
 * Payment Intent service — server-authoritative create / advance / read.
 * Stage 11F.1: NO external Stripe API calls.
 */

import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../transaction/index.js";
import { CreatePaymentIntentBodySchema } from "./schema.js";
import { reconcileSnapshotAgainstAcceptedOffer } from "./reconciliation-service.js";
import {
  appendLedgerEntry,
  listLedgerForIntent,
} from "./ledger-service.js";
import { PaymentRepository } from "./repository.js";
import { PAYMENT_LEDGER_VERSION } from "./version.js";
import {
  FinancialReconciliationError,
  PaymentAuthError,
  PaymentIdempotencyConflictError,
  PaymentNotFoundError,
  PaymentStateError,
  type CreatePaymentIntentResult,
  type GetPaymentIntentResult,
  type PaymentIntent,
  type PaymentIntentStatus,
} from "./types.js";

const CREATE_ALLOWED_TX = new Set(["AGREED", "PAYMENT_PENDING"]);

export class PaymentIntentService {
  private readonly intents: PaymentRepository;
  private readonly txRepo: TransactionRepository;

  constructor(private readonly db: TxQueryable) {
    this.intents = new PaymentRepository(db);
    this.txRepo = new TransactionRepository(db);
  }

  /**
   * Buyer-only create. Amount ALWAYS from vauto_deal_snapshots.amount_cents.
   * Client body may contain only idempotencyKey.
   */
  async createPaymentIntent(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<CreatePaymentIntentResult> {
    const body = CreatePaymentIntentBodySchema.parse(input.body);

    return runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const txRepo = new TransactionRepository(tx);

      const existingByKey = await intents.getByIdempotencyKey(
        body.idempotencyKey
      );
      if (existingByKey) {
        if (existingByKey.transactionId !== input.transactionId) {
          throw new PaymentIdempotencyConflictError(body.idempotencyKey);
        }
        await this.assertBuyerParticipant(
          tx,
          input.transactionId,
          input.actorUserId
        );
        const ledger = await listLedgerForIntent(tx, existingByKey.id);
        const live = (await txRepo.getById(input.transactionId))!;
        return {
          paymentIntent: existingByKey,
          ledgerEntry: ledger[0]!,
          transaction: {
            id: live.id,
            status: live.status,
            version: live.version,
          },
          idempotentReplay: true,
          paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
        };
      }

      const txn = await this.assertBuyerParticipant(
        tx,
        input.transactionId,
        input.actorUserId
      );

      if (!CREATE_ALLOWED_TX.has(txn.status)) {
        throw new PaymentStateError(
          `Payment intent requires AGREED (or PAYMENT_PENDING); got ${txn.status}`
        );
      }

      const byTx = await intents.getByTransactionId(input.transactionId);
      if (byTx) {
        // Different idempotency key on same tx → conflict
        throw new PaymentIdempotencyConflictError(body.idempotencyKey);
      }

      let facts;
      try {
        facts = await reconcileSnapshotAgainstAcceptedOffer(
          tx,
          input.transactionId
        );
      } catch (e) {
        if (e instanceof FinancialReconciliationError) throw e;
        throw e;
      }

      // Parties from snapshot (server), never from client
      if (
        facts.buyerId !== txn.buyerId ||
        facts.sellerId !== txn.sellerId ||
        facts.buyerId !== input.actorUserId
      ) {
        throw new PaymentAuthError();
      }

      const paymentIntent = await intents.insertCreated({
        transactionId: input.transactionId,
        dealSnapshotId: facts.dealSnapshotId,
        buyerId: facts.buyerId,
        sellerId: facts.sellerId,
        amountCents: facts.snapshotAmountCents,
        idempotencyKey: body.idempotencyKey,
      });

      const ledgerEntry = await appendLedgerEntry(tx, {
        paymentIntentId: paymentIntent.id,
        transactionId: input.transactionId,
        entryType: "DEBIT",
        amountCents: paymentIntent.amountCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-debit-${body.idempotencyKey}`,
        payloadJson: {
          event: "PAYMENT_INTENT_CREATED",
          dealSnapshotId: facts.dealSnapshotId,
          acceptedOfferId: facts.acceptedOfferId,
          paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
        },
      });

      // AGREED → PAYMENT_PENDING on successful intent create (payment requested)
      let live = txn;
      if (txn.status === "AGREED") {
        const sm = await txRepo.executeTransitionInTx(tx, {
          transactionId: txn.id,
          toStatus: "PAYMENT_PENDING",
          actorType: "BUYER",
          actorId: input.actorUserId,
          reasonCode: "PAYMENT_REQUESTED",
          expectedVersion: txn.version,
          idempotencyKey: `sm-pay-req-${body.idempotencyKey}`,
          metadata: {
            paymentIntentId: paymentIntent.id,
            amountCents: paymentIntent.amountCents,
          },
        });
        live = sm.transaction;
      }

      return {
        paymentIntent,
        ledgerEntry,
        transaction: {
          id: live.id,
          status: live.status,
          version: live.version,
        },
        idempotentReplay: false,
        paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
      };
    });
  }

  /** Participants (buyer/seller) may read; strangers → 404. */
  async getPaymentIntent(input: {
    transactionId: string;
    actorUserId: string;
  }): Promise<GetPaymentIntentResult> {
    await this.assertParticipant(
      this.db,
      input.transactionId,
      input.actorUserId
    );
    const paymentIntent = await this.intents.getByTransactionId(
      input.transactionId
    );
    if (!paymentIntent) {
      throw new PaymentNotFoundError();
    }
    const ledger = await listLedgerForIntent(this.db, paymentIntent.id);
    return {
      paymentIntent,
      ledger,
      paymentLedgerVersion: PAYMENT_LEDGER_VERSION,
    };
  }

  /**
   * Internal domain advance (no Stripe): CREATED → AUTHORIZING → HELD_IN_ESCROW.
   * Used by tests and reserved for future 11F.2 webhook wiring.
   */
  async holdInEscrow(input: {
    transactionId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const intent = await intents.getByTransactionId(input.transactionId);
      if (!intent) throw new PaymentNotFoundError();
      await this.assertBuyerParticipant(
        tx,
        input.transactionId,
        input.actorUserId
      );

      if (intent.status === "HELD_IN_ESCROW") {
        return intent;
      }
      if (intent.status !== "CREATED" && intent.status !== "AUTHORIZING") {
        throw new PaymentStateError(
          `Cannot hold escrow from status ${intent.status}`
        );
      }

      let current = intent;
      if (current.status === "CREATED") {
        current = await intents.updateStatus(tx, {
          id: current.id,
          expectedVersion: current.version,
          toStatus: "AUTHORIZING",
        });
      }
      current = await intents.updateStatus(tx, {
        id: current.id,
        expectedVersion: current.version,
        toStatus: "HELD_IN_ESCROW",
      });

      await appendLedgerEntry(tx, {
        paymentIntentId: current.id,
        transactionId: input.transactionId,
        entryType: "ESCROW_HOLD",
        amountCents: current.amountCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-hold-${input.idempotencyKey}`,
        payloadJson: { event: "ESCROW_HELD", status: current.status },
      });

      return current;
    });
  }

  /**
   * Internal domain advance (no Stripe): HELD_IN_ESCROW → RELEASED_TO_SELLER
   * + 11A PAYMENT_PENDING → PAID (SYSTEM).
   */
  async releaseToSeller(input: {
    transactionId: string;
    systemActorId?: string;
    idempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const txRepo = new TransactionRepository(tx);
      const intent = await intents.getByTransactionId(input.transactionId);
      if (!intent) throw new PaymentNotFoundError();

      if (intent.status === "RELEASED_TO_SELLER") {
        return intent;
      }
      if (intent.status !== "HELD_IN_ESCROW") {
        throw new PaymentStateError(
          `Cannot release from status ${intent.status}`
        );
      }

      const released = await intents.updateStatus(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        toStatus: "RELEASED_TO_SELLER",
      });

      await appendLedgerEntry(tx, {
        paymentIntentId: released.id,
        transactionId: input.transactionId,
        entryType: "ESCROW_RELEASE",
        amountCents: released.amountCents,
        actorId: input.systemActorId ?? "SYSTEM",
        idempotencyKey: `ledger-release-${input.idempotencyKey}`,
        payloadJson: { event: "RELEASED_TO_SELLER" },
      });

      const txn = (await txRepo.getById(input.transactionId))!;
      if (txn.status === "PAYMENT_PENDING") {
        await txRepo.executeTransitionInTx(tx, {
          transactionId: txn.id,
          toStatus: "PAID",
          actorType: "SYSTEM",
          actorId: input.systemActorId ?? "SYSTEM",
          reasonCode: "PAYMENT_CONFIRMED",
          expectedVersion: txn.version,
          idempotencyKey: `sm-pay-confirm-${input.idempotencyKey}`,
          metadata: {
            paymentIntentId: released.id,
            amountCents: released.amountCents,
          },
        });
      }

      return released;
    });
  }

  async refund(input: {
    transactionId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const intent = await intents.getByTransactionId(input.transactionId);
      if (!intent) throw new PaymentNotFoundError();
      await this.assertParticipant(tx, input.transactionId, input.actorUserId);

      if (intent.status === "REFUNDED") return intent;
      if (intent.status !== "HELD_IN_ESCROW") {
        throw new PaymentStateError(
          `Cannot refund from status ${intent.status}`
        );
      }

      const refunded = await intents.updateStatus(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        toStatus: "REFUNDED",
      });

      await appendLedgerEntry(tx, {
        paymentIntentId: refunded.id,
        transactionId: input.transactionId,
        entryType: "REFUND",
        amountCents: refunded.amountCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-refund-${input.idempotencyKey}`,
        payloadJson: { event: "REFUNDED" },
      });

      return refunded;
    });
  }

  async markFailed(input: {
    transactionId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const intent = await intents.getByTransactionId(input.transactionId);
      if (!intent) throw new PaymentNotFoundError();
      await this.assertBuyerParticipant(
        tx,
        input.transactionId,
        input.actorUserId
      );

      const failable: PaymentIntentStatus[] = [
        "CREATED",
        "AUTHORIZING",
        "HELD_IN_ESCROW",
      ];
      if (intent.status === "FAILED") return intent;
      if (!failable.includes(intent.status)) {
        throw new PaymentStateError(
          `Cannot fail from terminal status ${intent.status}`
        );
      }

      return intents.updateStatus(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        toStatus: "FAILED",
      });
    });
  }

  private async assertBuyerParticipant(
    db: TxQueryable,
    transactionId: string,
    actorUserId: string
  ) {
    const txn = await new TransactionRepository(db).getById(transactionId);
    if (!txn) throw new PaymentNotFoundError();
    if (txn.buyerId !== actorUserId) {
      // IDOR: seller / stranger → identical 404
      throw new PaymentAuthError();
    }
    return txn;
  }

  private async assertParticipant(
    db: TxQueryable,
    transactionId: string,
    actorUserId: string
  ) {
    const txn = await new TransactionRepository(db).getById(transactionId);
    if (!txn) throw new PaymentNotFoundError();
    if (txn.buyerId !== actorUserId && txn.sellerId !== actorUserId) {
      throw new PaymentAuthError();
    }
    return txn;
  }
}

export function createPaymentIntentService(
  db: TxQueryable
): PaymentIntentService {
  return new PaymentIntentService(db);
}

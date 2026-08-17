/**
 * Stage 11F.4 / 11F.6 — Funds release / refund (2-phase around Stripe Transfer).
 * Destination account + amounts are 100% server-derived.
 * 11F.6: privileged refund authority + REFUND_PENDING until Stripe succeeded.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../../transaction/index.js";
import {
  PaymentRepository,
  appendLedgerEntry,
  type PaymentIntent,
} from "../../payment/index.js";
import {
  createPaymentProvider,
  stripeIdempotencyKeyForSellerTransfer,
  type FakeStripeAdapter,
} from "../stripe/stripe-adapter.js";
import type { PaymentProvider } from "../stripe/types.js";
import {
  calculatePlatformFeeSplit,
  assertFeeSplitInvariant,
} from "./fee-calculator.js";
import {
  ReleaseToSellerBodySchema,
  RefundToBuyerBodySchema,
} from "./schema.js";
import { FUNDS_TRANSFER_VERSION } from "./version.js";
import {
  FundsTransferAuthError,
  FundsTransferForbiddenError,
  FundsTransferStateError,
  TransferBlockedError,
  REFUND_AUTHORITIES,
  type FundsTransferResult,
  type RefundAuthority,
  type SellerConnectPort,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FUNDS_TRANSFER_MIGRATION_ID = "047_funds_transfer_ledger_1.0";
export const FUNDS_TRANSFER_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/047_funds_transfer_ledger_1.0.sql"
  ),
  "utf8"
);

export const REFUND_PENDING_MIGRATION_ID = "048_refund_pending_authority_1.0";
export const REFUND_PENDING_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/048_refund_pending_authority_1.0.sql"
  ),
  "utf8"
);

export const IN_FLIGHT_TRANSFER_LOCK_MIGRATION_ID =
  "056_in_flight_transfer_lock_1.0";
export const IN_FLIGHT_TRANSFER_LOCK_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../../migrations/056_in_flight_transfer_lock_1.0.sql"
  ),
  "utf8"
);

const RELEASE_TX_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const ALLOWED_REFUND = new Set<string>(REFUND_AUTHORITIES);

/**
 * PostgreSQL aborts the whole TX after a failed statement (42P01 → 25P02).
 * Never probe optional relations with try/catch inside an open transaction.
 */
async function publicRelationExists(
  db: TxQueryable,
  relation: string
): Promise<boolean> {
  const r = await db.query<{ t: string | null }>(
    `SELECT to_regclass($1)::text AS t`,
    [`public.${relation}`]
  );
  return Boolean(r.rows[0]?.t);
}

/**
 * H-01/11H.3 soft gate (kept for diagnostics). Prefer atomic TRANSFER_EXECUTING lock.
 * Blocks DISPUTED / TRANSFER_BLOCKED unless arbitration already DECIDED_SELLER_PAYOUT.
 */
async function assertReleaseNotFrozenPreCall(
  db: TxQueryable,
  transactionId: string
): Promise<void> {
  const txRepo = new TransactionRepository(db);
  const intents = new PaymentRepository(db);
  const txn = await txRepo.getById(transactionId);
  if (!txn) throw new FundsTransferAuthError();

  const intent = await intents.getByTransactionId(transactionId);
  if (intent?.transferStatus === "TRANSFER_BLOCKED") {
    throw new FundsTransferStateError(
      "Pre-call freeze: TRANSFER_BLOCKED — Stripe transfer aborted"
    );
  }

  if (txn.status === "DISPUTED") {
    let decidedSeller = false;
    if (await publicRelationExists(db, "vauto_disputes")) {
      const d = await db.query<{ status: string }>(
        `SELECT status FROM vauto_disputes WHERE transaction_id = $1 LIMIT 1`,
        [transactionId]
      );
      const s = d.rows[0]?.status;
      decidedSeller =
        s === "DECIDED_SELLER_PAYOUT" || s === "RESOLVED_SELLER_PAYOUT";
    }
    if (!decidedSeller) {
      throw new FundsTransferStateError(
        "Pre-call freeze: DISPUTED — Stripe transfer aborted"
      );
    }
  }
}

/**
 * 11H.3 — atomic DB lock immediately before Stripe. 0 rows → fail-closed (no API call).
 * If already TRANSFER_EXECUTING (crash resume), continue with existing token.
 */
async function acquireTransferExecutingLock(
  db: TxQueryable,
  paymentIntentId: string
): Promise<{ intent: PaymentIntent; executionToken: string }> {
  const executionToken = randomUUID();
  const locked = await runQueryableTransaction(db, async (tx) => {
    const intents = new PaymentRepository(tx);
    const acquired = await intents.tryAcquireTransferExecutionLock(tx, {
      paymentIntentId,
      executionToken,
    });
    if (acquired) return { intent: acquired, executionToken };

    const live = await intents.getById(paymentIntentId);
    if (
      live &&
      live.transferStatus === "TRANSFER_EXECUTING" &&
      live.executionToken
    ) {
      return { intent: live, executionToken: live.executionToken };
    }
    return null;
  });
  if (!locked) {
    throw new FundsTransferStateError(
      "Pre-call execution lock failed — TRANSFER_EXECUTING denied (dispute or freeze)"
    );
  }
  return locked;
}

async function isAuthorizedDisputeSellerPayout(
  tx: TxQueryable,
  transactionId: string
): Promise<boolean> {
  if (!(await publicRelationExists(tx, "vauto_disputes"))) {
    return false;
  }
  const d = await tx.query<{ status: string }>(
    `SELECT status FROM vauto_disputes WHERE transaction_id = $1 LIMIT 1`,
    [transactionId]
  );
  const s = d.rows[0]?.status;
  return s === "DECIDED_SELLER_PAYOUT" || s === "RESOLVED_SELLER_PAYOUT";
}

function assertRefundAuthority(authority: unknown): RefundAuthority {
  if (typeof authority !== "string" || !ALLOWED_REFUND.has(authority)) {
    throw new FundsTransferForbiddenError();
  }
  return authority as RefundAuthority;
}

function toResult(
  intent: PaymentIntent,
  opts: { idempotentReplay: boolean; messageLt?: string | null }
): FundsTransferResult {
  let platformFeeCents = intent.platformFeeCents;
  let sellerNetCents = intent.sellerNetCents;
  if (platformFeeCents === 0 && sellerNetCents === 0) {
    const preview = calculatePlatformFeeSplit(intent.amountCents);
    platformFeeCents = preview.platformFeeCents;
    sellerNetCents = preview.sellerNetCents;
  } else {
    assertFeeSplitInvariant({
      grossAmountCents: intent.amountCents,
      platformFeeCents,
      sellerNetCents,
    });
  }
  return {
    paymentIntentId: intent.id,
    transactionId: intent.transactionId,
    transferStatus: intent.transferStatus,
    status: intent.status,
    grossAmountCents: intent.amountCents,
    platformFeeCents,
    sellerNetCents,
    stripeTransferId: intent.stripeTransferId,
    stripeRefundId: intent.stripeRefundId,
    messageLt: opts.messageLt ?? null,
    idempotentReplay: opts.idempotentReplay,
    fundsTransferVersion: FUNDS_TRANSFER_VERSION,
  };
}

/**
 * Finalize REFUND_PENDING → REFUNDED only when Stripe refund status is succeeded.
 * Used by refundToBuyer TX2 and signed webhooks (charge.refunded / refund.updated).
 */
export async function finalizeBuyerRefundFromProvider(
  tx: TxQueryable,
  input: {
    paymentIntentId: string;
    transactionId: string;
    actorUserId: string;
    stripeRefundId: string;
    stripeRefundStatus: string;
    afterTransfer?: boolean;
  }
): Promise<PaymentIntent> {
  const intents = new PaymentRepository(tx);
  const live = await intents.getById(input.paymentIntentId);
  if (!live) throw new FundsTransferStateError("Payment intent missing");

  if (live.transferStatus === "REFUNDED" && live.stripeRefundId) {
    return live;
  }

  const succeeded = input.stripeRefundStatus === "succeeded";

  if (!succeeded) {
    return intents.updateTransferFields(tx, {
      id: live.id,
      expectedVersion: live.version,
      transferStatus: "REFUND_PENDING",
      stripeRefundId: input.stripeRefundId,
      toStatus: "REFUND_PENDING",
    });
  }

  const afterTransfer =
    input.afterTransfer ??
    (Boolean(live.stripeTransferId) &&
      (live.transferStatus === "TRANSFERRED" ||
        live.transferStatus === "REFUND_PENDING"));

  if (afterTransfer && live.stripeTransferId) {
    const net =
      live.sellerNetCents > 0
        ? live.sellerNetCents
        : calculatePlatformFeeSplit(live.amountCents).sellerNetCents;
    await appendLedgerEntry(tx, {
      paymentIntentId: live.id,
      transactionId: live.transactionId,
      entryType: "TRANSFER_REVERSED",
      amountCents: net,
      actorId: input.actorUserId,
      idempotencyKey: `ledger-xfer-rev-${input.transactionId}`,
      payloadJson: {
        event: "TRANSFER_REVERSED",
        stripeTransferId: live.stripeTransferId,
      },
    });
  }

  const updated = await intents.updateTransferFields(tx, {
    id: live.id,
    expectedVersion: live.version,
    transferStatus: "REFUNDED",
    stripeRefundId: input.stripeRefundId,
    toStatus: "REFUNDED",
  });

  await appendLedgerEntry(tx, {
    paymentIntentId: updated.id,
    transactionId: updated.transactionId,
    entryType: "BUYER_REFUNDED",
    amountCents: updated.amountCents,
    actorId: input.actorUserId,
    idempotencyKey: `ledger-buyer-refund-${input.transactionId}`,
    payloadJson: {
      event: "BUYER_REFUNDED",
      stripeRefundId: input.stripeRefundId,
      fundsTransferVersion: FUNDS_TRANSFER_VERSION,
    },
  });

  return updated;
}

export class FundsTransferService {
  constructor(
    private readonly db: TxQueryable,
    private readonly provider: PaymentProvider,
    private readonly sellerConnect: SellerConnectPort
  ) {}

  /**
   * Release seller net via Stripe Connect Transfer (2-phase).
   * TX1 → Stripe transfer → TX2. Never open DB TX during network call.
   */
  async releaseToSeller(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<FundsTransferResult> {
    const body = ReleaseToSellerBodySchema.parse(input.body);

    const phase1 = await runQueryableTransaction(this.db, async (tx) => {
      return this.runTx1PrepareTransfer(tx, {
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        clientIdempotencyKey: body.idempotencyKey,
      });
    });

    if (phase1.blocked) {
      return toResult(phase1.intent, {
        idempotentReplay: false,
        messageLt: phase1.messageLt,
      });
    }

    if (
      phase1.intent.transferStatus === "TRANSFERRED" &&
      phase1.intent.stripeTransferId
    ) {
      return toResult(phase1.intent, { idempotentReplay: true });
    }

    const destination = phase1.destinationAccountId!;
    const split = calculatePlatformFeeSplit(phase1.intent.amountCents);
    const transferKey = stripeIdempotencyKeyForSellerTransfer(
      input.transactionId,
      1
    );

    // Soft diagnostic gate (DISPUTED / TRANSFER_BLOCKED) before atomic lock.
    await assertReleaseNotFrozenPreCall(this.db, input.transactionId);

    // 11H.3: atomic TRANSFER_EXECUTING lock — Stripe only after successful lock.
    const { intent: lockedIntent, executionToken } =
      await acquireTransferExecutingLock(this.db, phase1.intent.id);

    let transfer;
    try {
      transfer = await this.provider.createTransfer({
        amountCents: split.sellerNetCents,
        currency: "eur",
        destinationAccountId: destination,
        idempotencyKey: transferKey,
        metadata: {
          vautoTransactionId: input.transactionId,
          vautoPaymentIntentId: lockedIntent.id,
          fundsTransferVersion: FUNDS_TRANSFER_VERSION,
          executionToken,
        },
      });
    } catch (e) {
      await runQueryableTransaction(this.db, async (tx) => {
        const intents = new PaymentRepository(tx);
        await intents.releaseTransferExecutionLock(tx, {
          paymentIntentId: lockedIntent.id,
          executionToken,
        });
      });
      throw e;
    }

    const attached = await runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const live = await intents.getById(lockedIntent.id);
      if (!live) throw new FundsTransferStateError("Payment intent missing");

      if (live.transferStatus === "TRANSFERRED" && live.stripeTransferId) {
        return live;
      }

      const updated = await intents.updateTransferFields(tx, {
        id: live.id,
        expectedVersion: live.version,
        platformFeeCents: split.platformFeeCents,
        sellerNetCents: split.sellerNetCents,
        transferStatus: "TRANSFERRED",
        stripeTransferId: transfer.id,
        toStatus: "RELEASED_TO_SELLER",
        clearExecutionLock: true,
      });

      await appendLedgerEntry(tx, {
        paymentIntentId: updated.id,
        transactionId: updated.transactionId,
        entryType: "SELLER_TRANSFERRED",
        amountCents: split.sellerNetCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-seller-xfer-${input.transactionId}`,
        payloadJson: {
          event: "SELLER_TRANSFERRED",
          stripeTransferId: transfer.id,
          destinationAccountId: destination,
          platformFeeCents: split.platformFeeCents,
          sellerNetCents: split.sellerNetCents,
          fundsTransferVersion: FUNDS_TRANSFER_VERSION,
          executionToken,
        },
      });

      return updated;
    });

    return toResult(attached, {
      idempotentReplay: phase1.wasPendingReplay,
      messageLt: "Lėšos išmokamos pardavėjui",
    });
  }

  /**
   * Refund buyer — privileged only (SYSTEM / ADMIN / DISPUTE_ENGINE / MUTUAL_CANCEL).
   * REFUND_PENDING until Stripe status === 'succeeded'.
   */
  async refundToBuyer(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
    authority: RefundAuthority;
  }): Promise<FundsTransferResult> {
    const authority = assertRefundAuthority(input.authority);
    const body = RefundToBuyerBodySchema.parse(input.body);

    const prepared = await runQueryableTransaction(this.db, async (tx) => {
      const intents = new PaymentRepository(tx);
      const txRepo = new TransactionRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new FundsTransferAuthError();

      const intent = await intents.getByTransactionIdForUpdate(
        tx,
        input.transactionId
      );
      if (!intent) throw new FundsTransferStateError("No payment intent");

      if (
        intent.transferStatus === "TRANSFER_PENDING" ||
        intent.transferStatus === "TRANSFER_EXECUTING"
      ) {
        throw new FundsTransferStateError(
          "Seller transfer in progress — refund deferred until transfer finality"
        );
      }

      if (intent.transferStatus === "REFUNDED" && intent.stripeRefundId) {
        return { intent, alreadyDone: true as const, afterTransfer: false };
      }

      if (intent.transferStatus === "REFUND_PENDING") {
        return {
          intent,
          alreadyDone: true as const,
          afterTransfer: false,
        };
      }

      if (
        intent.status !== "HELD_IN_ESCROW" &&
        intent.status !== "RELEASED_TO_SELLER" &&
        intent.transferStatus !== "TRANSFERRED"
      ) {
        throw new FundsTransferStateError(
          `Cannot refund from status ${intent.status}/${intent.transferStatus}`
        );
      }

      const afterTransfer =
        intent.transferStatus === "TRANSFERRED" &&
        Boolean(intent.stripeTransferId);

      const pending = await intents.updateTransferFields(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        transferStatus: "REFUND_PENDING",
        toStatus: "REFUND_PENDING",
      });

      await appendLedgerEntry(tx, {
        paymentIntentId: pending.id,
        transactionId: pending.transactionId,
        entryType: "BUYER_REFUND_PENDING",
        amountCents: pending.amountCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-refund-pend-${input.transactionId}`,
        payloadJson: {
          event: "BUYER_REFUND_PENDING",
          authority,
        },
      });

      return {
        intent: pending,
        alreadyDone: false as const,
        afterTransfer,
      };
    });

    if (prepared.alreadyDone) {
      return toResult(prepared.intent, {
        idempotentReplay: true,
        messageLt:
          prepared.intent.transferStatus === "REFUND_PENDING"
            ? "Grąžinimas laukia Stripe patvirtinimo"
            : "Pinigai grąžinti pirkėjui",
      });
    }

    const intent = prepared.intent;
    if (!intent.stripePaymentIntentId) {
      throw new FundsTransferStateError("Missing stripe payment intent id");
    }

    if (prepared.afterTransfer && intent.stripeTransferId) {
      const net =
        intent.sellerNetCents > 0
          ? intent.sellerNetCents
          : calculatePlatformFeeSplit(intent.amountCents).sellerNetCents;
      await this.provider.createTransferReversal({
        transferId: intent.stripeTransferId,
        amountCents: net,
        idempotencyKey: `vauto:transaction:${input.transactionId}:transfer-reversal:1`,
      });
    }

    const refund = await this.provider.createRefund({
      paymentIntentId: intent.stripePaymentIntentId,
      amountCents: intent.amountCents,
      idempotencyKey: `vauto:transaction:${input.transactionId}:buyer-refund:1`,
    });

    const final = await runQueryableTransaction(this.db, async (tx) => {
      return finalizeBuyerRefundFromProvider(tx, {
        paymentIntentId: intent.id,
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        stripeRefundId: refund.id,
        stripeRefundStatus: refund.status,
        afterTransfer: prepared.afterTransfer,
      });
    });

    return toResult(final, {
      idempotentReplay: false,
      messageLt:
        final.transferStatus === "REFUNDED"
          ? "Pinigai grąžinti pirkėjui"
          : "Grąžinimas laukia Stripe patvirtinimo",
    });
  }

  /** Test helper — TX1 only (crash before Stripe transfer). */
  async tx1OnlyPrepareTransferForTests(input: {
    transactionId: string;
    actorUserId: string;
    clientIdempotencyKey: string;
  }): Promise<PaymentIntent> {
    return runQueryableTransaction(this.db, async (tx) => {
      const r = await this.runTx1PrepareTransfer(tx, input);
      return r.intent;
    });
  }

  private async runTx1PrepareTransfer(
    tx: TxQueryable,
    input: {
      transactionId: string;
      actorUserId: string;
      clientIdempotencyKey: string;
    }
  ): Promise<{
    intent: PaymentIntent;
    destinationAccountId: string | null;
    blocked: boolean;
    messageLt: string | null;
    wasPendingReplay: boolean;
  }> {
    const intents = new PaymentRepository(tx);
    const txRepo = new TransactionRepository(tx);
    const txn = await txRepo.getById(input.transactionId);
    if (!txn) throw new FundsTransferAuthError();

    if (txn.buyerId !== input.actorUserId && txn.sellerId !== input.actorUserId) {
      throw new FundsTransferAuthError();
    }

    const disputeSellerPayout = await isAuthorizedDisputeSellerPayout(
      tx,
      input.transactionId
    );
    if (
      !RELEASE_TX_STATUSES.has(txn.status) &&
      !(txn.status === "DISPUTED" && disputeSellerPayout)
    ) {
      throw new FundsTransferStateError(
        `Release requires DELIVERED, COMPLETED, or DECIDED_SELLER_PAYOUT dispute; got ${txn.status}`
      );
    }

    const intent = await intents.getByTransactionIdForUpdate(
      tx,
      input.transactionId
    );
    if (!intent) {
      throw new FundsTransferStateError("No payment intent for transaction");
    }
    if (
      intent.transferStatus === "REFUNDED" ||
      intent.transferStatus === "REFUND_PENDING"
    ) {
      throw new FundsTransferStateError("Already refunded or refund pending");
    }

    if (
      intent.transferStatus === "TRANSFER_BLOCKED" &&
      !disputeSellerPayout
    ) {
      throw new FundsTransferStateError(
        "TRANSFER_BLOCKED — release rejected (fail-closed)"
      );
    }

    const releasable =
      intent.status === "HELD_IN_ESCROW" ||
      intent.transferStatus === "TRANSFER_PENDING" ||
      (intent.status === "RELEASED_TO_SELLER" &&
        intent.transferStatus === "TRANSFERRED");
    if (!releasable) {
      throw new FundsTransferStateError(
        `Funds not held for release (status=${intent.status}/${intent.transferStatus})`
      );
    }

    if (intent.transferStatus === "TRANSFERRED" && intent.stripeTransferId) {
      return {
        intent,
        destinationAccountId: null,
        blocked: false,
        messageLt: null,
        wasPendingReplay: true,
      };
    }

    if (intent.transferStatus === "TRANSFER_EXECUTING") {
      const accountId = await this.sellerConnect.getSellerStripeAccountId(
        intent.sellerId
      );
      if (!accountId || !accountId.startsWith("acct_")) {
        throw new FundsTransferStateError(
          "TRANSFER_EXECUTING but seller Connect account missing"
        );
      }
      return {
        intent,
        destinationAccountId: accountId,
        blocked: false,
        messageLt: null,
        wasPendingReplay: true,
      };
    }

    const accountId = await this.sellerConnect.getSellerStripeAccountId(
      intent.sellerId
    );
    if (!accountId || !accountId.startsWith("acct_")) {
      const blocked = await intents.updateTransferFields(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        transferStatus: "TRANSFER_BLOCKED",
      });
      return {
        intent: blocked,
        destinationAccountId: null,
        blocked: true,
        messageLt:
          "Pardavėjas turi užbaigti mokėjimų paskyros patvirtinimą.",
        wasPendingReplay: false,
      };
    }

    const split = calculatePlatformFeeSplit(intent.amountCents);

    let current = intent;
    if (intent.transferStatus !== "TRANSFER_PENDING") {
      current = await intents.updateTransferFields(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        platformFeeCents: split.platformFeeCents,
        sellerNetCents: split.sellerNetCents,
        transferStatus: "TRANSFER_PENDING",
      });

      if (split.platformFeeCents > 0) {
        await appendLedgerEntry(tx, {
          paymentIntentId: current.id,
          transactionId: current.transactionId,
          entryType: "PLATFORM_FEE_RESERVED",
          amountCents: split.platformFeeCents,
          actorId: input.actorUserId,
          idempotencyKey: `ledger-fee-res-${input.transactionId}`,
          payloadJson: {
            event: "PLATFORM_FEE_RESERVED",
            platformFeeCents: split.platformFeeCents,
            sellerNetCents: split.sellerNetCents,
            fundsTransferVersion: FUNDS_TRANSFER_VERSION,
          },
        });
      }

      await appendLedgerEntry(tx, {
        paymentIntentId: current.id,
        transactionId: current.transactionId,
        entryType: "SELLER_TRANSFER_PENDING",
        amountCents: split.sellerNetCents,
        actorId: input.actorUserId,
        idempotencyKey: `ledger-xfer-pend-${input.transactionId}`,
        payloadJson: {
          event: "SELLER_TRANSFER_PENDING",
          messageLt: "Pinigai laikomi iki sandorio užbaigimo",
          fundsTransferVersion: FUNDS_TRANSFER_VERSION,
        },
      });
    }

    return {
      intent: current,
      destinationAccountId: accountId,
      blocked: false,
      messageLt: null,
      wasPendingReplay: intent.transferStatus === "TRANSFER_PENDING",
    };
  }
}

/** Test harness only — never set in production. */
let sellerConnectOverride: SellerConnectPort | null = null;

export function setSellerConnectOverride(port: SellerConnectPort | null): void {
  sellerConnectOverride = port;
}

export function createFundsTransferService(
  db: TxQueryable,
  opts?: {
    provider?: PaymentProvider;
    sellerConnect?: SellerConnectPort;
  }
): FundsTransferService {
  const sellerConnect: SellerConnectPort =
    opts?.sellerConnect ??
    sellerConnectOverride ??
    {
      async getSellerStripeAccountId(sellerId: string) {
        const { getUserStripeConnectAccountId } = await import(
          "../../repository.js"
        );
        return getUserStripeConnectAccountId(sellerId);
      },
    };
  return new FundsTransferService(
    db,
    opts?.provider ??
      createPaymentProvider({ forceFake: !process.env.STRIPE_SECRET_KEY }),
    sellerConnect
  );
}

export function createTestFundsTransferService(
  db: TxQueryable,
  opts: {
    fake?: FakeStripeAdapter;
    sellerAccounts?: Record<string, string | null>;
  } = {}
): { service: FundsTransferService; fake: FakeStripeAdapter } {
  const fake =
    opts.fake ??
    (createPaymentProvider({ forceFake: true }) as FakeStripeAdapter);
  const accounts = opts.sellerAccounts ?? {};
  const service = new FundsTransferService(db, fake, {
    async getSellerStripeAccountId(sellerId) {
      if (sellerId in accounts) return accounts[sellerId] ?? null;
      return `acct_fake_${sellerId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
    },
  });
  return { service, fake };
}

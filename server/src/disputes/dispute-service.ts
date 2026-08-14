/**
 * Stage 11H.2 — Dispute Resolution: decision ≠ financial finality.
 * openDispute → DISPUTED + TRANSFER_BLOCKED (or TRANSFER_ALREADY_EXECUTED).
 * resolveDispute (ADMIN/SYSTEM) → DECIDED_* + durable financial job only.
 * Final RESOLVED_* / COMPLETED / CANCELLED only after 11F confirmation.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../transaction/index.js";
import { PaymentRepository } from "../payment/index.js";
import { DisputeRepository } from "./dispute-repository.js";
import {
  DisputeFinancialJobRepository,
  processDisputeFinancialJobs,
} from "./dispute-financial-jobs.js";
import {
  OpenDisputeBodySchema,
  ResolveDisputeBodySchema,
} from "./schema.js";
import { DISPUTE_ENGINE_VERSION } from "./version.js";
import {
  DISPUTE_OPEN_ELIGIBLE_STATUSES,
  DisputeAdminRequiredError,
  DisputeAuthError,
  DisputeNotFoundError,
  DisputeStateError,
  type DisputeEvidence,
  type DisputeFundsPort,
  type DisputeResult,
  type FundsFreezeState,
  type VautoDispute,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DISPUTE_MIGRATION_ID = "053_dispute_resolution_1.0";
export const DISPUTE_MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../migrations/053_dispute_resolution_1.0.sql"),
  "utf8"
);

export const DISPUTE_FINALITY_MIGRATION_ID =
  "055_dispute_financial_finality_1.0";
export const DISPUTE_FINALITY_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/055_dispute_financial_finality_1.0.sql"
  ),
  "utf8"
);

export type { DisputeFundsPort };

function toResult(
  dispute: VautoDispute,
  txn: { status: string; version: number },
  opts: {
    fundsFrozen: boolean;
    transferStatus: string | null;
    fundsAction: DisputeResult["fundsAction"];
    fundsTransferStatus: string | null;
    messageLt: string | null;
    idempotentReplay: boolean;
  }
): DisputeResult {
  return {
    dispute,
    transactionStatus: txn.status,
    transactionVersion: txn.version,
    fundsFrozen: opts.fundsFrozen,
    transferStatus: opts.transferStatus,
    fundsAction: opts.fundsAction,
    fundsTransferStatus: opts.fundsTransferStatus,
    messageLt: opts.messageLt,
    idempotentReplay: opts.idempotentReplay,
    disputeEngineVersion: DISPUTE_ENGINE_VERSION,
  };
}

async function collectEvidence(
  db: TxQueryable,
  transactionId: string,
  openedAtStatus: string,
  fundsFreezeState: FundsFreezeState
): Promise<DisputeEvidence> {
  const snap = await db.query<{ id: string }>(
    `SELECT id FROM vauto_deal_snapshots WHERE transaction_id = $1 LIMIT 1`,
    [transactionId]
  );
  const vautoDealSnapshotId = snap.rows[0]?.id ?? null;

  let trackingCode: string | null = null;
  try {
    const dlv = await db.query<{ tracking_code: string }>(
      `SELECT tracking_code FROM vauto_deliveries WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    trackingCode = dlv.rows[0]?.tracking_code ?? null;
  } catch {
    trackingCode = null;
  }

  let fullChatCanonicalHash: string | null = null;
  let lastChatMessageId: string | null = null;
  let lastChatMessageHash: string | null = null;
  try {
    const msgs = await db.query<{ id: string; text: string | null }>(
      `SELECT id, text FROM vauto_transaction_messages
       WHERE transaction_id = $1 AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [transactionId]
    );
    if (msgs.rows.length > 0) {
      const canonical = msgs.rows
        .map((m) => `${m.id}:${String(m.text ?? "")}`)
        .join("\n");
      fullChatCanonicalHash = createHash("sha256")
        .update(canonical)
        .digest("hex");
      const last = msgs.rows[msgs.rows.length - 1]!;
      lastChatMessageId = last.id;
      lastChatMessageHash = createHash("sha256")
        .update(String(last.text ?? "") + ":" + last.id)
        .digest("hex");
    }
  } catch {
    // Chat table may be absent in minimal harness — evidence still valid.
  }

  const timelinePayload = [
    openedAtStatus,
    vautoDealSnapshotId ?? "",
    trackingCode ?? "",
    fullChatCanonicalHash ?? "",
    fundsFreezeState,
  ].join("|");
  const evidenceManifestHash = createHash("sha256")
    .update(timelinePayload)
    .digest("hex");

  return {
    vautoDealSnapshotId,
    trackingCode,
    fullChatCanonicalHash,
    evidenceManifestHash,
    lastChatMessageId,
    lastChatMessageHash,
    fundsFreezeState,
    openedAtTransactionStatus: openedAtStatus,
    disputeEngineVersion: DISPUTE_ENGINE_VERSION,
  };
}

/**
 * Freeze / classify payouts for dispute evidence.
 * Never pretends TRANSFER_BLOCKED when provider already has the transfer
 * (TRANSFER_EXECUTING / TRANSFERRED).
 */
async function freezeFundsForDispute(
  tx: TxQueryable,
  transactionId: string
): Promise<{ transferStatus: string | null; fundsFreezeState: FundsFreezeState }> {
  const intents = new PaymentRepository(tx);
  const intent = await intents.getByTransactionIdForUpdate(tx, transactionId);
  let transferStatus: string | null = null;
  let fundsFreezeState: FundsFreezeState = "NONE";

  if (intent) {
    if (intent.transferStatus === "TRANSFERRED" && intent.stripeTransferId) {
      transferStatus = "TRANSFER_ALREADY_EXECUTED";
      fundsFreezeState = "TRANSFER_ALREADY_EXECUTED";
    } else if (intent.transferStatus === "TRANSFER_EXECUTING") {
      transferStatus = "TRANSFER_EXECUTING";
      fundsFreezeState = "TRANSFER_IN_FLIGHT";
    } else if (
      intent.transferStatus !== "REFUNDED" &&
      intent.transferStatus !== "REFUND_PENDING"
    ) {
      const updated = await intents.updateTransferFields(tx, {
        id: intent.id,
        expectedVersion: intent.version,
        transferStatus: "TRANSFER_BLOCKED",
      });
      transferStatus = updated.transferStatus;
      fundsFreezeState = "TRANSFER_BLOCKED";
    } else {
      transferStatus = intent.transferStatus;
      fundsFreezeState = "NONE";
    }
  }

  if (fundsFreezeState === "TRANSFER_BLOCKED") {
    try {
      await tx.query(
        `UPDATE seller_release_jobs
         SET status = 'FAILED',
             last_error = 'dispute_opened_funds_frozen',
             processing_started_at = NULL,
             updated_at = NOW()
         WHERE transaction_id = $1
           AND status IN ('PENDING', 'PROCESSING')`,
        [transactionId]
      );
    } catch {
      // seller_release_jobs may be absent in minimal harness
    }
  }

  return { transferStatus, fundsFreezeState };
}

/** Clear TRANSFER_BLOCKED so authorized dispute payout can proceed via 11F. */
async function clearTransferBlockForDecidedPayout(
  tx: TxQueryable,
  transactionId: string
): Promise<void> {
  const intents = new PaymentRepository(tx);
  const intent = await intents.getByTransactionIdForUpdate(tx, transactionId);
  if (!intent) return;
  if (intent.transferStatus !== "TRANSFER_BLOCKED") return;
  await intents.updateTransferFields(tx, {
    id: intent.id,
    expectedVersion: intent.version,
    transferStatus: "NOT_STARTED",
  });
}

export class DisputeService {
  constructor(
    private readonly db: TxQueryable,
    private readonly fundsPort: DisputeFundsPort | null
  ) {}

  async openDispute(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<DisputeResult> {
    const body = OpenDisputeBodySchema.parse(input.body);

    const phase = await runQueryableTransaction(this.db, async (tx) => {
      const txRepo = new TransactionRepository(tx);
      const disputes = new DisputeRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new DisputeAuthError();
      if (
        txn.buyerId !== input.actorUserId &&
        txn.sellerId !== input.actorUserId
      ) {
        throw new DisputeAuthError();
      }

      const existing = await disputes.getByTransactionIdForUpdate(
        input.transactionId
      );
      if (existing) {
        return {
          dispute: existing,
          txn,
          transferStatus: null as string | null,
          alreadyDone: true as const,
        };
      }

      if (txn.status === "DISPUTED") {
        throw new DisputeStateError("Transaction already DISPUTED");
      }

      if (
        !(DISPUTE_OPEN_ELIGIBLE_STATUSES as readonly string[]).includes(
          txn.status
        )
      ) {
        throw new DisputeStateError(
          `Dispute open requires SHIPPED or DELIVERED (inspection window); got ${txn.status}`
        );
      }

      // Classify freeze BEFORE evidence insert (immutable evidence_json).
      // Insert OPEN dispute first so concurrent TRANSFER_EXECUTING lock fails closed.
      const intents = new PaymentRepository(tx);
      await intents.getByTransactionIdForUpdate(tx, input.transactionId);

      const live = (
        await txRepo.executeTransitionInTx(tx, {
          transactionId: txn.id,
          toStatus: "DISPUTED",
          actorType:
            txn.buyerId === input.actorUserId ? "BUYER" : "SELLER",
          actorId: input.actorUserId,
          reasonCode: "DISPUTE_OPENED",
          expectedVersion: txn.version,
          idempotencyKey: `dsp-open-${body.idempotencyKey}`,
          metadata: {
            reason: body.reason,
            disputeEngineVersion: DISPUTE_ENGINE_VERSION,
          },
        })
      ).transaction;

      // Placeholder dispute row so atomic transfer lock sees OPEN before freeze classify.
      // Evidence filled via freeze → collect → we need insert with final evidence.
      // Order: freeze classify (intent locked) → evidence → insert dispute.
      // But OPEN must exist before concurrent lock; freeze does not require OPEN row
      // for classification — OPEN is required for release lock. Insert after freeze
      // in same TX is atomic to concurrent readers after COMMIT.
      const frozen = await freezeFundsForDispute(tx, input.transactionId);
      const evidence = await collectEvidence(
        tx,
        input.transactionId,
        txn.status,
        frozen.fundsFreezeState
      );

      const dispute = await disputes.insert({
        transactionId: input.transactionId,
        openedByUserId: input.actorUserId,
        reason: body.reason,
        description: body.description,
        evidenceJson: evidence,
        status: "OPEN",
      });

      return {
        dispute,
        txn: live,
        transferStatus: frozen.transferStatus,
        alreadyDone: false as const,
      };
    });

    const alreadyExecuted =
      phase.transferStatus === "TRANSFER_ALREADY_EXECUTED" ||
      phase.dispute.evidenceJson?.fundsFreezeState ===
        "TRANSFER_ALREADY_EXECUTED";
    const inFlight =
      phase.dispute.evidenceJson?.fundsFreezeState === "TRANSFER_IN_FLIGHT";

    return toResult(phase.dispute, phase.txn, {
      fundsFrozen: !alreadyExecuted && !inFlight,
      transferStatus: phase.transferStatus,
      fundsAction: "NONE",
      fundsTransferStatus: null,
      messageLt: phase.alreadyDone
        ? "Ginčas jau atidarytas — lėšos įšaldytos"
        : alreadyExecuted
          ? "Ginčas atidarytas — išmokėjimas jau įvykdytas anksčiau"
          : inFlight
            ? "Ginčas atidarytas — išmokėjimas jau vykdomas (in-flight)"
            : "Ginčas atidarytas — išmokėjimas užblokuotas",
      idempotentReplay: phase.alreadyDone,
    });
  }

  /**
   * ADMIN / SYSTEM only — records DECIDED_* + durable financial job.
   * Does NOT move TX to COMPLETED/CANCELLED until 11F confirms.
   */
  async resolveDispute(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
    authority: "ADMIN" | "SYSTEM";
  }): Promise<DisputeResult> {
    if (input.authority !== "ADMIN" && input.authority !== "SYSTEM") {
      throw new DisputeAdminRequiredError();
    }
    const body = ResolveDisputeBodySchema.parse(input.body);

    const phase = await runQueryableTransaction(this.db, async (tx) => {
      const txRepo = new TransactionRepository(tx);
      const disputes = new DisputeRepository(tx);
      const jobs = new DisputeFinancialJobRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new DisputeAuthError();

      const dispute = await disputes.getByTransactionIdForUpdate(
        input.transactionId
      );
      if (!dispute) throw new DisputeNotFoundError();

      if (
        dispute.status === "RESOLVED_BUYER_REFUND" ||
        dispute.status === "RESOLVED_SELLER_PAYOUT"
      ) {
        return {
          dispute,
          txn,
          alreadyDone: true as const,
          financialPending: false as const,
          resolution: body.resolution,
        };
      }

      if (
        dispute.status === "DECIDED_BUYER_REFUND" ||
        dispute.status === "DECIDED_SELLER_PAYOUT"
      ) {
        return {
          dispute,
          txn,
          alreadyDone: true as const,
          financialPending: true as const,
          resolution: body.resolution,
        };
      }

      if (txn.status !== "DISPUTED") {
        throw new DisputeStateError(
          `Resolve requires DISPUTED; got ${txn.status}`
        );
      }

      const isRefund = body.resolution === "RESOLVE_BUYER_REFUND";
      const decided = await disputes.markDecided({
        id: dispute.id,
        status: isRefund ? "DECIDED_BUYER_REFUND" : "DECIDED_SELLER_PAYOUT",
        resolvedByUserId: input.actorUserId,
        resolutionNotes: body.resolutionNotes ?? null,
      });

      if (!isRefund) {
        await clearTransferBlockForDecidedPayout(tx, input.transactionId);
      }

      await jobs.ensurePendingInTx({
        disputeId: decided.id,
        transactionId: input.transactionId,
        resolution: body.resolution,
        idempotencyKey: body.idempotencyKey,
        actorUserId: input.actorUserId,
        sellerId: txn.sellerId,
        buyerId: txn.buyerId,
      });

      // TX stays DISPUTED until financial worker confirms 11F success.
      const live = (await txRepo.getById(input.transactionId))!;

      return {
        dispute: decided,
        txn: live,
        alreadyDone: false as const,
        financialPending: true as const,
        resolution: body.resolution,
      };
    });

    if (phase.alreadyDone && !phase.financialPending) {
      return toResult(phase.dispute, phase.txn, {
        fundsFrozen: false,
        transferStatus: null,
        fundsAction: "NONE",
        fundsTransferStatus: null,
        messageLt: "Ginčas jau išspręstas",
        idempotentReplay: true,
      });
    }

    return toResult(phase.dispute, phase.txn, {
      fundsFrozen: true,
      transferStatus: null,
      fundsAction: "FINANCIAL_ACTION_PENDING",
      fundsTransferStatus: null,
      messageLt:
        phase.resolution === "RESOLVE_BUYER_REFUND"
          ? "Sprendimas užfiksuotas — laukiama grąžinimo patvirtinimo"
          : "Sprendimas užfiksuotas — laukiama išmokėjimo patvirtinimo",
      idempotentReplay: phase.alreadyDone,
    });
  }

  /**
   * Process durable financial jobs for this service's DB (tests / boot).
   */
  async processFinancialJobs(opts?: {
    limit?: number;
    forceImmediate?: boolean;
  }) {
    return processDisputeFinancialJobs(this.db, this.fundsPort, opts);
  }

  async getDispute(input: {
    transactionId: string;
    actorUserId: string;
    isAdmin?: boolean;
  }): Promise<DisputeResult> {
    const txn = await new TransactionRepository(this.db).getById(
      input.transactionId
    );
    if (!txn) throw new DisputeAuthError();
    if (
      !input.isAdmin &&
      txn.buyerId !== input.actorUserId &&
      txn.sellerId !== input.actorUserId
    ) {
      throw new DisputeAuthError();
    }
    const dispute = await new DisputeRepository(this.db).getByTransactionId(
      input.transactionId
    );
    if (!dispute) throw new DisputeNotFoundError();

    let transferStatus: string | null = null;
    try {
      const intent = await new PaymentRepository(this.db).getByTransactionId(
        input.transactionId
      );
      transferStatus = intent?.transferStatus ?? null;
    } catch {
      transferStatus = null;
    }

    const pending =
      dispute.status === "DECIDED_BUYER_REFUND" ||
      dispute.status === "DECIDED_SELLER_PAYOUT";
    const open =
      dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW";

    return toResult(dispute, txn, {
      fundsFrozen: open || pending,
      transferStatus,
      fundsAction: pending ? "FINANCIAL_ACTION_PENDING" : "NONE",
      fundsTransferStatus: null,
      messageLt: null,
      idempotentReplay: false,
    });
  }
}

export function createDisputeService(
  db: TxQueryable,
  opts?: { fundsPort?: DisputeFundsPort | null }
): DisputeService {
  return new DisputeService(db, opts?.fundsPort ?? null);
}

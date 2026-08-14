/**
 * Stage 11G.2 H-02 — Release / DELIVERED eligibility gates.
 * Open dispute, refund-in-flight, or SYSTEM_FINANCIAL_LOCK block payout.
 */

import type { TxQueryable } from "../transaction/index.js";
import { PaymentRepository } from "../payment/index.js";
import { DeliveryReleaseBlockedError } from "./types.js";

const FINANCIAL_LOCK_TRANSFER = new Set([
  "TRANSFER_BLOCKED",
  "TRANSFER_EXECUTING",
]);

export type ReleaseEligibilityOk = { ok: true };
export type ReleaseEligibilityDenied = {
  ok: false;
  reason:
    | "NOT_SHIPPED"
    | "OPEN_DISPUTE"
    | "REFUND_PENDING"
    | "REFUNDED"
    | "SYSTEM_FINANCIAL_LOCK";
  httpStatus: 403 | 409;
  message: string;
};

export type ReleaseEligibilityResult =
  | ReleaseEligibilityOk
  | ReleaseEligibilityDenied;

async function tableExists(db: TxQueryable, table: string): Promise<boolean> {
  const res = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table]
  );
  return Boolean(res.rows[0]?.exists);
}

async function hasOpenDisputeRow(
  db: TxQueryable,
  transactionId: string
): Promise<boolean> {
  if (!(await tableExists(db, "vauto_disputes"))) return false;
  const res = await db.query(
    `SELECT 1 AS ok FROM vauto_disputes
     WHERE transaction_id = $1
       AND UPPER(COALESCE(status, 'OPEN')) IN ('OPEN', 'PENDING', 'ACTIVE', 'OPENED')
     LIMIT 1`,
    [transactionId]
  );
  return (res.rows?.length ?? 0) > 0;
}

/**
 * Dispute / refund / financial-lock gates (status-agnostic payout safety).
 * Used before skip-state SHIPPING_PENDING → SHIPPED → DELIVERED cascade.
 */
export async function checkPayoutSafetyGates(
  db: TxQueryable,
  transactionId: string,
  transactionStatus: string
): Promise<ReleaseEligibilityResult> {
  if (transactionStatus === "DISPUTED") {
    return {
      ok: false,
      reason: "OPEN_DISPUTE",
      httpStatus: 409,
      message: "Open dispute blocks delivery confirmation and payout",
    };
  }

  if (await hasOpenDisputeRow(db, transactionId)) {
    return {
      ok: false,
      reason: "OPEN_DISPUTE",
      httpStatus: 409,
      message: "Open dispute blocks delivery confirmation and payout",
    };
  }

  const intent = await new PaymentRepository(db).getByTransactionId(
    transactionId
  );
  if (intent) {
    if (
      intent.status === "REFUND_PENDING" ||
      intent.transferStatus === "REFUND_PENDING"
    ) {
      return {
        ok: false,
        reason: "REFUND_PENDING",
        httpStatus: 409,
        message: "Refund in progress blocks delivery confirmation and payout",
      };
    }
    if (intent.status === "REFUNDED" || intent.transferStatus === "REFUNDED") {
      return {
        ok: false,
        reason: "REFUNDED",
        httpStatus: 409,
        message: "Refunded payment blocks delivery confirmation and payout",
      };
    }
    if (FINANCIAL_LOCK_TRANSFER.has(intent.transferStatus)) {
      return {
        ok: false,
        reason: "SYSTEM_FINANCIAL_LOCK",
        httpStatus: 403,
        message: "SYSTEM_FINANCIAL_LOCK blocks delivery confirmation and payout",
      };
    }
  }

  return { ok: true };
}

/**
 * Preconditions before SHIPPED → DELIVERED and before releaseToSeller.
 */
export async function checkReleaseEligibility(
  db: TxQueryable,
  input: {
    transactionId: string;
    transactionStatus: string;
  }
): Promise<ReleaseEligibilityResult> {
  if (input.transactionStatus !== "SHIPPED") {
    return {
      ok: false,
      reason: "NOT_SHIPPED",
      httpStatus: 409,
      message: `Confirm requires SHIPPED; got ${input.transactionStatus}`,
    };
  }

  return checkPayoutSafetyGates(
    db,
    input.transactionId,
    input.transactionStatus
  );
}

export async function assertPayoutSafetyGates(
  db: TxQueryable,
  input: { transactionId: string; transactionStatus: string }
): Promise<void> {
  const result = await checkPayoutSafetyGates(
    db,
    input.transactionId,
    input.transactionStatus
  );
  if (!result.ok) {
    throw new DeliveryReleaseBlockedError(
      result.message,
      result.httpStatus,
      result.reason
    );
  }
}

export async function assertReleaseEligibility(
  db: TxQueryable,
  input: { transactionId: string; transactionStatus: string }
): Promise<void> {
  const result = await checkReleaseEligibility(db, input);
  if (!result.ok) {
    throw new DeliveryReleaseBlockedError(
      result.message,
      result.httpStatus,
      result.reason
    );
  }
}

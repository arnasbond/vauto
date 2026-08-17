/**
 * Deterministic transition validation & pure apply (no I/O).
 */

import { createHash } from "node:crypto";
import { findTransitionEdge, isTerminalStatus } from "./transition-matrix.js";
import { resolveFulfillmentPolicy, policyContextFromTx } from "./policies/index.js";
import type { PolicyContext } from "./policies/index.js";
import {
  InvalidTransitionError,
  PolicyForbiddenError,
  type ActorType,
  type ReasonCode,
  type TransactionStatus,
  type VautoTransaction,
} from "./types.js";
import { TRANSACTION_STATE_MACHINE_VERSION } from "./version.js";

export type ValidatedTransition = {
  from: TransactionStatus;
  to: TransactionStatus;
  actorType: ActorType;
  reasonCode: ReasonCode;
};

/**
 * Assert that (from → to) is allowed for actor + reason.
 * Optional policy context selects the fulfillment matrix (default: carrier / 11A).
 */
export function assertTransitionAllowed(
  from: TransactionStatus,
  to: TransactionStatus,
  actorType: ActorType,
  reasonCode: ReasonCode,
  policy?: PolicyContext | null
): ValidatedTransition {
  if (from === to) {
    throw new InvalidTransitionError(
      from,
      to,
      actorType,
      "Self-transitions are not allowed"
    );
  }
  const fulfillment = resolveFulfillmentPolicy(
    policy?.fulfillmentType ?? "CARRIER_DELIVERY"
  );
  if (isTerminalStatus(from) && fulfillment.id === "CARRIER_DELIVERY") {
    throw new InvalidTransitionError(
      from,
      to,
      actorType,
      `Terminal status ${from} has no outbound transitions`
    );
  }
  if (fulfillment.forbidsUnauthenticatedCompletion(from, to, actorType)) {
    throw new PolicyForbiddenError(
      from,
      to,
      actorType,
      "Counterparty confirmation is required before COMPLETED"
    );
  }
  const edge =
    fulfillment.id === "CARRIER_DELIVERY"
      ? findTransitionEdge(from, to, actorType)
      : fulfillment.findEdge(from, to, actorType);
  if (!edge) {
    throw new InvalidTransitionError(from, to, actorType);
  }
  if (edge.requiredReasons && !edge.requiredReasons.includes(reasonCode)) {
    throw new InvalidTransitionError(
      from,
      to,
      actorType,
      `Reason ${reasonCode} not allowed for ${from} -> ${to}`
    );
  }
  return { from, to, actorType, reasonCode };
}

/** Apply status change in memory (version +1). Does not touch DB. */
export function applyTransitionPure(
  tx: VautoTransaction,
  to: TransactionStatus,
  actorType: ActorType,
  reasonCode: ReasonCode
): VautoTransaction {
  assertTransitionAllowed(
    tx.status,
    to,
    actorType,
    reasonCode,
    policyContextFromTx(tx)
  );
  const now = new Date().toISOString();
  return {
    ...tx,
    status: to,
    version: tx.version + 1,
    updatedAt: now,
    stateMachineVersion: TRANSACTION_STATE_MACHINE_VERSION,
  };
}

/** Canonical hash for audit chain integrity. */
export function computeStateHash(input: {
  transactionId: string;
  sequenceId: number;
  fromStatus: TransactionStatus;
  toStatus: TransactionStatus;
  version: number;
  actorType: ActorType;
  actorId: string;
  reasonCode: ReasonCode;
  previousHash: string | null;
}): string {
  const payload = [
    TRANSACTION_STATE_MACHINE_VERSION,
    input.transactionId,
    String(input.sequenceId),
    input.fromStatus,
    input.toStatus,
    String(input.version),
    input.actorType,
    input.actorId,
    input.reasonCode,
    input.previousHash ?? "GENESIS",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function computeIdempotencyFingerprint(input: {
  transactionId: string;
  toStatus: TransactionStatus;
  actorType: ActorType;
  actorId: string;
  reasonCode: ReasonCode;
  expectedVersion: number;
}): string {
  return createHash("sha256")
    .update(
      [
        input.transactionId,
        input.toStatus,
        input.actorType,
        input.actorId,
        input.reasonCode,
        String(input.expectedVersion),
      ].join("|")
    )
    .digest("hex");
}

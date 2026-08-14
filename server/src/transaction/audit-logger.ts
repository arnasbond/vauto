/**
 * Append-only audit log helpers for Transaction State Machine 1.0.
 */

import { randomUUID } from "node:crypto";
import { computeStateHash } from "./state-machine.js";
import type {
  ActorType,
  ReasonCode,
  TransactionAuditRecord,
  TransactionStatus,
} from "./types.js";

export type AuditAppendInput = {
  transactionId: string;
  sequenceId: number;
  eventId: string;
  fromStatus: TransactionStatus;
  toStatus: TransactionStatus;
  versionAfter: number;
  actorType: ActorType;
  actorId: string;
  reasonCode: ReasonCode;
  previousHash: string | null;
};

export function buildAuditRecord(
  input: AuditAppendInput
): TransactionAuditRecord {
  const stateHash = computeStateHash({
    transactionId: input.transactionId,
    sequenceId: input.sequenceId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    version: input.versionAfter,
    actorType: input.actorType,
    actorId: input.actorId,
    reasonCode: input.reasonCode,
    previousHash: input.previousHash,
  });
  return {
    id: randomUUID(),
    transactionId: input.transactionId,
    sequenceId: input.sequenceId,
    eventId: input.eventId,
    stateHash,
    createdAt: new Date().toISOString(),
  };
}

/** Verify audit chain hashes (append-only integrity). */
export function verifyAuditChain(
  rows: Array<{
    sequenceId: number;
    stateHash: string;
    fromStatus: TransactionStatus;
    toStatus: TransactionStatus;
    versionAfter: number;
    actorType: ActorType;
    actorId: string;
    reasonCode: ReasonCode;
    transactionId: string;
  }>
): { ok: boolean; brokenAt: number | null } {
  let prev: string | null = null;
  const sorted = [...rows].sort((a, b) => a.sequenceId - b.sequenceId);
  for (const row of sorted) {
    const expected = computeStateHash({
      transactionId: row.transactionId,
      sequenceId: row.sequenceId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      version: row.versionAfter,
      actorType: row.actorType,
      actorId: row.actorId,
      reasonCode: row.reasonCode,
      previousHash: prev,
    });
    if (expected !== row.stateHash) {
      return { ok: false, brokenAt: row.sequenceId };
    }
    prev = row.stateHash;
  }
  return { ok: true, brokenAt: null };
}

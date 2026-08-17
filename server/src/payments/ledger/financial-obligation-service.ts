/**
 * Stage 11J.1 — platform-managed money capped by platform_managed_amount_cents.
 * Create/refund run in an atomic TX with SELECT ... FOR UPDATE (no TOCTOU).
 */

import { randomUUID } from "node:crypto";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../../transaction/index.js";
import { FinancialObligationRepository } from "./financial-obligation-repository.js";
import {
  FinancialCapExceededError,
  ObligationLimitError,
  ObligationNotFoundError,
  type FinancialObligation,
  type FinancialObligationType,
} from "./financial-obligation-types.js";

function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  if (err.code === "23505") return true;
  return /unique|duplicate key/i.test(String(err.message ?? ""));
}

function heldSum(rows: FinancialObligation[]): number {
  return rows
    .filter(
      (o) =>
        o.type !== "REFUND" &&
        o.status !== "CANCELLED" &&
        o.status !== "REFUNDED"
    )
    .reduce((s, o) => s + o.amountCents, 0);
}

/**
 * Public ledger API: create / refund only.
 * provider_verified_at is NOT writable here. Provenance mutation lives in
 * payments/stripe/webhooks/trusted-provider-provenance.ts and is reachable
 * only after Stripe.webhooks.constructEvent().
 */
export class FinancialObligationService {
  constructor(private readonly db: TxQueryable) {}

  async createObligation(input: {
    transactionId: string;
    type: FinancialObligationType;
    amountCents: number;
    payerId: string;
    beneficiaryId: string;
    currency?: string;
    idempotencyKey?: string;
  }): Promise<FinancialObligation> {
    return runQueryableTransaction(this.db, async (tx) => {
      const capRow = await tx.query<{
        platform_managed_amount_cents: string | number | null;
      }>(
        `SELECT platform_managed_amount_cents
         FROM vauto_transactions
         WHERE id = $1
         FOR UPDATE`,
        [input.transactionId]
      );
      if (!capRow.rows[0]) throw new ObligationNotFoundError("Transaction not found");

      if (input.amountCents <= 0) {
        throw new ObligationLimitError("Obligation amount must be > 0");
      }

      const cap = Number(capRow.rows[0].platform_managed_amount_cents ?? 0);
      if (input.type !== "REFUND" && input.amountCents > cap) {
        throw new FinancialCapExceededError(
          `Obligation ${input.amountCents} exceeds platform_managed_amount_cents ${cap}`
        );
      }

      const repo = new FinancialObligationRepository(tx);
      const existing = await repo.listByTransactionForUpdate(input.transactionId);
      const held = heldSum(existing);
      if (input.type !== "REFUND" && held + input.amountCents > cap) {
        throw new FinancialCapExceededError(
          `Held obligations ${held + input.amountCents} exceed platform cap ${cap}`
        );
      }

      return repo.insert({
        ...input,
        status: "HELD",
        idempotencyKey:
          input.idempotencyKey ?? `create:${randomUUID().replace(/-/g, "")}`,
      });
    });
  }

  async refundObligation(input: {
    transactionId: string;
    sourceObligationId: string;
    amountCents: number;
    actorUserId: string;
    idempotencyKey?: string;
  }): Promise<FinancialObligation> {
    return runQueryableTransaction(this.db, async (tx) => {
      const capRow = await tx.query<{
        platform_managed_amount_cents: string | number | null;
      }>(
        `SELECT platform_managed_amount_cents
         FROM vauto_transactions
         WHERE id = $1
         FOR UPDATE`,
        [input.transactionId]
      );
      if (!capRow.rows[0]) throw new ObligationNotFoundError("Transaction not found");
      const cap = Number(capRow.rows[0].platform_managed_amount_cents ?? 0);

      const txRepo = new TransactionRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new ObligationNotFoundError("Transaction not found");

      const repo = new FinancialObligationRepository(tx);
      const source = await repo.getByIdForUpdate(input.sourceObligationId);
      if (!source || source.transactionId !== input.transactionId) {
        throw new ObligationNotFoundError();
      }
      if (input.amountCents <= 0) {
        throw new ObligationLimitError("Refund amount must be > 0");
      }
      if (input.amountCents > source.amountCents) {
        throw new ObligationLimitError(
          `Refund ${input.amountCents} exceeds obligation ${source.amountCents}`
        );
      }
      if (source.status === "REFUNDED" || source.status === "CANCELLED") {
        throw new ObligationLimitError(
          "Source obligation is already refunded or cancelled"
        );
      }

      const existing = await repo.listByTransactionForUpdate(input.transactionId);
      const alreadyRefunded = existing
        .filter((o) => o.type === "REFUND" && o.sourceObligationId === source.id)
        .reduce((s, o) => s + o.amountCents, 0);
      if (alreadyRefunded + input.amountCents > source.amountCents) {
        throw new ObligationLimitError(
          `Refund ${alreadyRefunded + input.amountCents} exceeds source obligation ${source.amountCents}`
        );
      }
      if (input.amountCents > cap || alreadyRefunded + input.amountCents > cap) {
        throw new FinancialCapExceededError(
          `Refund exceeds platform_managed_amount_cents ${cap}`
        );
      }

      const idempotencyKey =
        input.idempotencyKey ?? `refund:${source.id}`;
      try {
        const refund = await repo.insert({
          transactionId: input.transactionId,
          type: "REFUND",
          amountCents: input.amountCents,
          currency: source.currency,
          payerId: source.beneficiaryId,
          beneficiaryId: source.payerId,
          status: "REFUNDED",
          idempotencyKey,
          sourceObligationId: source.id,
        });
        if (alreadyRefunded + input.amountCents === source.amountCents) {
          await repo.updateStatus(source.id, "REFUNDED");
        }
        return refund;
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ObligationLimitError("Duplicate refund for this obligation");
        }
        throw e;
      }
    });
  }
}

export function createFinancialObligationService(db: TxQueryable) {
  return new FinancialObligationService(db);
}

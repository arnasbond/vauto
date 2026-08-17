/**
 * Stage 11J.4 / 11J.5 — Stripe provenance capability boundary.
 *
 * Two runtime capabilities (both WeakSet identity, not TypeScript casts):
 * 1. SIGNATURE_VERIFIED_STRIPE_EVENTS — object returned by constructEvent()
 *    inside signature-verifier.ts
 * 2. MINTED_PROVENANCE — token minted only after (1) + local PI reconciliation
 */

import type Stripe from "stripe";
import {
  runQueryableTransaction,
  type TxQueryable,
} from "../../../transaction/index.js";
import { FinancialObligationRepository } from "../../ledger/financial-obligation-repository.js";
import {
  ObligationNotFoundError,
  ProviderEventReplayError,
  ProviderMetadataMismatchError,
  UntrustedProviderProvenanceError,
  type FinancialObligation,
} from "../../ledger/financial-obligation-types.js";
import { StripePaymentIntentObjectSchema } from "./schema.js";
import {
  isSignatureVerifiedStripeEvent,
  verifyStripeWebhookSignature,
  type VerifiedStripeEvent,
} from "./signature-verifier.js";

const MINTED_PROVENANCE = new WeakSet<object>();

export type TrustedProviderProvenance = {
  readonly paymentProvider: "STRIPE";
  readonly paymentProviderRef: string;
  readonly providerEventId: string;
  readonly expectedTransactionId: string;
  readonly expectedAmountCents: number;
  readonly expectedCurrency: string;
};

function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  if (err.code === "23505") return true;
  return /unique|duplicate key/i.test(String(err.message ?? ""));
}

export function isMintedTrustedProviderProvenance(
  value: unknown
): value is TrustedProviderProvenance {
  return typeof value === "object" && value !== null && MINTED_PROVENANCE.has(value);
}

function mintFromVerifiedStripeEvent(
  event: VerifiedStripeEvent,
  local: {
    transactionId: string;
    amountCents: number;
    currency: string;
    stripePaymentIntentId: string;
  }
): TrustedProviderProvenance {
  if (!isSignatureVerifiedStripeEvent(event)) {
    throw new UntrustedProviderProvenanceError(
      "Stripe event was not produced by Stripe.webhooks.constructEvent()"
    );
  }
  if (event.type !== "payment_intent.succeeded") {
    throw new ProviderMetadataMismatchError(
      "Only payment_intent.succeeded can verify obligation provenance"
    );
  }
  const parsed = StripePaymentIntentObjectSchema.parse(event.data.object);
  if (parsed.id !== local.stripePaymentIntentId) {
    throw new ProviderMetadataMismatchError(
      "Stripe PaymentIntent id does not match local intent"
    );
  }
  if (parsed.amount !== local.amountCents) {
    throw new ProviderMetadataMismatchError(
      "Stripe amount does not match local PaymentIntent"
    );
  }
  const eventCurrency = parsed.currency.trim().toUpperCase();
  const localCurrency = local.currency.trim().toUpperCase();
  if (eventCurrency !== localCurrency) {
    throw new ProviderMetadataMismatchError(
      "Stripe currency does not match local PaymentIntent"
    );
  }

  const token: TrustedProviderProvenance = Object.freeze({
    paymentProvider: "STRIPE",
    paymentProviderRef: parsed.id,
    providerEventId: String(event.id),
    expectedTransactionId: local.transactionId,
    expectedAmountCents: local.amountCents,
    expectedCurrency: localCurrency,
  });
  MINTED_PROVENANCE.add(token);
  return token;
}

/**
 * HTTP / test path: raw body → constructEvent → trusted token.
 * Event id and PaymentIntent id are taken from the verified Stripe event,
 * never from caller-supplied provenance strings.
 */
export function mintTrustedProviderProvenanceFromSignedWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string | string[] | undefined;
  webhookSecret: string | undefined;
  localTransactionId: string;
  localAmountCents: number;
  localCurrency: string;
  localStripePaymentIntentId: string;
}): TrustedProviderProvenance {
  const event = verifyStripeWebhookSignature({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    webhookSecret: input.webhookSecret,
  });
  return mintFromVerifiedStripeEvent(event, {
    transactionId: input.localTransactionId,
    amountCents: input.localAmountCents,
    currency: input.localCurrency,
    stripePaymentIntentId: input.localStripePaymentIntentId,
  });
}

/**
 * Production webhook processor path. `event` must be the same object
 * returned by verifyStripeWebhookSignature() (constructEvent + runtime registry).
 * A forged Stripe.Event POJO / `as Stripe.Event` is rejected.
 */
export function mintTrustedProviderProvenanceFromVerifiedStripeEvent(
  event: Stripe.Event,
  local: {
    transactionId: string;
    amountCents: number;
    currency: string;
    stripePaymentIntentId: string;
  }
): TrustedProviderProvenance {
  return mintFromVerifiedStripeEvent(event, local);
}

async function writeProvenanceInTx(
  tx: TxQueryable,
  trusted: TrustedProviderProvenance,
  opts?: { obligationId?: string }
): Promise<FinancialObligation | null> {
  if (!isMintedTrustedProviderProvenance(trusted)) {
    throw new UntrustedProviderProvenanceError();
  }

  const repo = new FinancialObligationRepository(tx);
  const source = opts?.obligationId
    ? await repo.getByIdForUpdate(opts.obligationId)
    : await repo.findUnverifiedPrimaryForUpdate({
        transactionId: trusted.expectedTransactionId,
      });

  if (opts?.obligationId && !source) {
    throw new ObligationNotFoundError();
  }
  if (!source) return null;

  if (source.transactionId !== trusted.expectedTransactionId) {
    throw new ProviderMetadataMismatchError(
      "Provider event transaction_id does not match obligation"
    );
  }
  if (source.amountCents !== trusted.expectedAmountCents) {
    throw new ProviderMetadataMismatchError(
      "Provider event amount_cents does not match obligation"
    );
  }
  if (source.currency.toUpperCase() !== trusted.expectedCurrency) {
    throw new ProviderMetadataMismatchError(
      "Provider event currency does not match obligation"
    );
  }

  if (source.providerVerifiedAt && source.paymentProviderRef) {
    if (
      source.providerEventId === trusted.providerEventId &&
      source.paymentProviderRef === trusted.paymentProviderRef
    ) {
      return source;
    }
    throw new ProviderEventReplayError(trusted.providerEventId);
  }

  try {
    const res = await tx.query<{
      id: string;
      transaction_id: string;
      type: string;
      amount_cents: string | number;
      currency: string;
      payer_id: string;
      beneficiary_id: string;
      status: string;
      payment_provider_ref: string | null;
      created_at: Date | string;
      idempotency_key?: string | null;
      source_obligation_id?: string | null;
      payment_provider?: string | null;
      provider_event_id?: string | null;
      provider_verified_at?: Date | string | null;
    }>(
      `UPDATE vauto_financial_obligations
       SET payment_provider = $1,
           payment_provider_ref = $2,
           provider_event_id = $3,
           provider_verified_at = NOW(),
           status = CASE WHEN status = 'CREATED' THEN 'HELD' ELSE status END
       WHERE id = $4
         AND provider_verified_at IS NULL
       RETURNING *`,
      [
        trusted.paymentProvider,
        trusted.paymentProviderRef,
        trusted.providerEventId,
        source.id,
      ]
    );
    const row = res.rows[0];
    if (!row) {
      throw new ProviderEventReplayError(trusted.providerEventId);
    }
    const verifiedAt = row.provider_verified_at;
    return {
      id: row.id,
      transactionId: row.transaction_id,
      type: row.type as FinancialObligation["type"],
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      payerId: row.payer_id,
      beneficiaryId: row.beneficiary_id,
      status: row.status as FinancialObligation["status"],
      paymentProviderRef: row.payment_provider_ref,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      idempotencyKey: row.idempotency_key ?? null,
      sourceObligationId: row.source_obligation_id ?? null,
      paymentProvider: row.payment_provider ?? null,
      providerEventId: row.provider_event_id ?? null,
      providerVerifiedAt:
        verifiedAt == null
          ? null
          : verifiedAt instanceof Date
            ? verifiedAt.toISOString()
            : String(verifiedAt),
    };
  } catch (e) {
    if (e instanceof ProviderEventReplayError) throw e;
    if (isUniqueViolation(e)) {
      throw new ProviderEventReplayError(trusted.providerEventId);
    }
    throw e;
  }
}

export async function applyTrustedProviderProvenance(
  db: TxQueryable,
  trusted: TrustedProviderProvenance,
  opts?: { obligationId?: string }
): Promise<FinancialObligation | null> {
  if (!isMintedTrustedProviderProvenance(trusted)) {
    throw new UntrustedProviderProvenanceError();
  }
  return runQueryableTransaction(db, (tx) =>
    writeProvenanceInTx(tx, trusted, opts)
  );
}

export async function applyTrustedProviderProvenanceInTx(
  tx: TxQueryable,
  trusted: TrustedProviderProvenance,
  opts?: { obligationId?: string }
): Promise<FinancialObligation | null> {
  return writeProvenanceInTx(tx, trusted, opts);
}

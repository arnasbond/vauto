/**
 * Stage 11F.6 / 11F.7 — Live Stripe provider lookup for reconciliation.
 * M-01: Direct retrieve(stripe_*_id) — never transfers.list({ limit: 100 }).
 */

import Stripe from "stripe";
import type { ProviderMirror } from "./types.js";
import type {
  ProviderLookup,
  ProviderLookupContext,
} from "./reconciler.js";
import type { TxQueryable } from "../../transaction/index.js";
import type { FakeStripeAdapter } from "../stripe/stripe-adapter.js";
import { createPaymentProvider } from "../stripe/stripe-adapter.js";

function mirrorFromParts(input: {
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  status: string;
  transferId: string | null;
  transferAmountCents: number | null;
  refundId: string | null;
  refundAmountCents: number | null;
  reversalAmountCents: number | null;
}): ProviderMirror {
  return {
    paymentIntentId: input.paymentIntentId,
    amountCents: input.amountCents,
    currency: input.currency.toLowerCase(),
    status: input.status,
    transferId: input.transferId,
    transferAmountCents: input.transferAmountCents,
    refundId: input.refundId,
    refundAmountCents: input.refundAmountCents,
    reversalAmountCents: input.reversalAmountCents,
  };
}

/**
 * Production lookup via Stripe SDK when STRIPE_SECRET_KEY is set.
 * Transfer / refund / reversal facts come from retrieve(known DB id) only.
 */
export function createLiveStripeProviderLookup(): ProviderLookup | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;

  const stripe = new Stripe(key);

  return {
    async lookupByStripePaymentIntentId(
      stripePaymentIntentId: string,
      knownIds?: ProviderLookupContext
    ) {
      try {
        const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

        let transferId: string | null = null;
        let transferAmountCents: number | null = null;
        let reversalAmountCents: number | null = null;

        if (knownIds?.stripeTransferId) {
          const tr = await stripe.transfers.retrieve(knownIds.stripeTransferId);
          transferId = tr.id;
          transferAmountCents = tr.amount;
          if (tr.reversed || (tr.amount_reversed ?? 0) > 0) {
            reversalAmountCents = tr.amount_reversed ?? tr.amount;
          }
          if (knownIds.stripeReversalId) {
            try {
              const rev = await stripe.transfers.retrieveReversal(
                tr.id,
                knownIds.stripeReversalId
              );
              reversalAmountCents = rev.amount ?? reversalAmountCents;
            } catch {
              // keep amount_reversed from transfer
            }
          }
        }

        let refundId: string | null = null;
        let refundAmountCents: number | null = null;
        if (knownIds?.stripeRefundId) {
          const rf = await stripe.refunds.retrieve(knownIds.stripeRefundId);
          refundId = rf.id;
          refundAmountCents = rf.amount ?? null;
        }

        return mirrorFromParts({
          paymentIntentId: pi.id,
          amountCents: pi.amount,
          currency: pi.currency,
          status: pi.status,
          transferId,
          transferAmountCents,
          refundId,
          refundAmountCents,
          reversalAmountCents,
        });
      } catch {
        return null;
      }
    },
  };
}

/** Test / CI: FakeStripeAdapter — retrieve by known IDs (not list-window). */
export function createFakeStripeProviderLookup(
  fake: FakeStripeAdapter
): ProviderLookup {
  return {
    async lookupByStripePaymentIntentId(
      stripePaymentIntentId: string,
      knownIds?: ProviderLookupContext
    ) {
      const pi = fake.inspectPaymentIntent(stripePaymentIntentId);
      if (!pi) return null;

      let transfer = knownIds?.stripeTransferId
        ? fake.retrieveTransfer(knownIds.stripeTransferId)
        : null;
      if (!transfer) {
        // Fallback only for tests without known DB id yet — still keyed by PI, not global list cap
        transfer =
          fake.listTransfers({ stripePaymentIntentId })[0] ?? null;
      }

      let refund = knownIds?.stripeRefundId
        ? fake.retrieveRefund(knownIds.stripeRefundId)
        : null;
      if (!refund) {
        refund =
          fake.listRefunds({ paymentIntentId: stripePaymentIntentId })[0] ??
          null;
      }

      const reversals = transfer
        ? fake.listReversals({ transferId: transfer.id })
        : [];
      const reversal =
        (knownIds?.stripeReversalId
          ? reversals.find((r) => r.id === knownIds.stripeReversalId)
          : null) ??
        reversals[0] ??
        null;

      return mirrorFromParts({
        paymentIntentId: pi.id,
        amountCents: pi.amountCents,
        currency: pi.currency,
        status: pi.status,
        transferId: transfer?.id ?? null,
        transferAmountCents: transfer?.amountCents ?? null,
        refundId: refund?.id ?? null,
        refundAmountCents: refund?.amountCents ?? null,
        reversalAmountCents: reversal?.amountCents ?? null,
      });
    },
  };
}

/** Prefer live Stripe; otherwise null (never silently invent provider facts). */
export function createProductionProviderLookup(): ProviderLookup | null {
  return createLiveStripeProviderLookup();
}

/** Repair port attaching Stripe PI id on recoverable drift. */
export function createDbRepairPort(db: TxQueryable) {
  return {
    async attachStripePaymentIntentId(input: {
      paymentIntentId: string;
      stripePaymentIntentId: string;
    }) {
      await db.query(
        `UPDATE vauto_payment_intents
         SET stripe_payment_intent_id = $1,
             version = version + 1,
             updated_at = NOW()
         WHERE id = $2
           AND stripe_payment_intent_id IS NULL`,
        [input.stripePaymentIntentId, input.paymentIntentId]
      );
    },
  };
}

/** Ensure createPaymentProvider stays importable for wiring checks. */
export function assertPaymentProviderFactoryAvailable(): boolean {
  return typeof createPaymentProvider === "function";
}

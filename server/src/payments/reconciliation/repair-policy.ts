/**
 * Deterministic repair policy.
 * Auto-heal ONLY when provider fact is clearly safe (known PI id, same amount,
 * currency, transaction link). NEVER auto-fix amount/seller mismatches.
 */

import type { TxQueryable } from "../../transaction/repository.js";
import type { AutoRepairAction, DiscrepancyFinding } from "./types.js";

export type RepairPort = {
  attachStripePaymentIntentId(input: {
    paymentIntentId: string;
    stripePaymentIntentId: string;
  }): Promise<void>;
};

/**
 * Apply only safe auto-heals. Returns actions taken (including skipped).
 */
export async function applySafeRepairs(
  _db: TxQueryable,
  findings: DiscrepancyFinding[],
  port: RepairPort | null,
  providerPiByPaymentIntent: Map<string, string>
): Promise<AutoRepairAction[]> {
  const actions: AutoRepairAction[] = [];

  for (const f of findings) {
    if (f.classification === "SECURITY_MISMATCH") {
      actions.push({
        paymentIntentId: f.paymentIntentId,
        action: "refuse_amount_or_seller_mismatch",
        applied: false,
        reason: "SECURITY_MISMATCH_no_auto_heal",
      });
      continue;
    }
    if (f.classification === "MANUAL_REVIEW") {
      actions.push({
        paymentIntentId: f.paymentIntentId,
        action: "queue_manual_review",
        applied: false,
        reason: f.code,
      });
      continue;
    }
    if (
      f.classification === "RECOVERABLE_DRIFT" &&
      f.safeAutoHeal &&
      f.code === "MISSING_STRIPE_PI_LINK"
    ) {
      const stripeId = providerPiByPaymentIntent.get(f.paymentIntentId);
      if (!stripeId || !port) {
        actions.push({
          paymentIntentId: f.paymentIntentId,
          action: "attach_stripe_pi_id",
          applied: false,
          reason: "missing_provider_or_port",
        });
        continue;
      }
      await port.attachStripePaymentIntentId({
        paymentIntentId: f.paymentIntentId,
        stripePaymentIntentId: stripeId,
      });
      actions.push({
        paymentIntentId: f.paymentIntentId,
        action: "attach_stripe_pi_id",
        applied: true,
        reason: "safe_provider_link_match",
      });
      continue;
    }
  }

  return actions;
}

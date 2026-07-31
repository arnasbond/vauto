/**
 * Fraud gate: money can only move between accounts that Stripe already knows.
 *
 * Scope is deliberately narrow — free browsing, messaging and local pickup
 * listings stay open. Only two actions are gated:
 *   - buying (escrow checkout) requires a saved card on the buyer
 *   - publishing a listing that offers shipping requires Connect payouts on the seller
 */
import type { Response } from "express";
import {
  getPaymentMethodRecord,
  isPaymentMethodSchemaReady,
} from "./payment-methods-repo.js";

export const PAYMENT_GATE_CODE = "payment_method_required";
export const PAYOUT_GATE_CODE = "payout_method_required";

export const PAYMENT_GATE_MESSAGE =
  "Norėdami pirkti, pirmiausia pridėkite mokėjimo kortelę profilio nustatymuose.";
export const PAYOUT_GATE_MESSAGE =
  "Skelbimams su siuntimu reikia patvirtinto išmokėjimo metodo. Užbaikite Stripe patikrą profilio nustatymuose.";

const SETTINGS_PATH = "/profile/settings/?focus=payments";

export async function hasSavedCard(userId: string): Promise<boolean> {
  const record = await getPaymentMethodRecord(userId);
  return Boolean(record?.paymentMethodId);
}

export async function hasVerifiedPayout(userId: string): Promise<boolean> {
  const record = await getPaymentMethodRecord(userId);
  return record?.payout?.status === "verified";
}

/** Returns true when the response has been terminated with a 402. */
export async function rejectIfBuyerHasNoCard(
  res: Response,
  userId: string
): Promise<boolean> {
  // Schema lag must not 500 the checkout path — fail-open until migrate 032.
  if (!(await isPaymentMethodSchemaReady())) return false;
  if (await hasSavedCard(userId)) return false;
  res.status(402).json({
    error: PAYMENT_GATE_MESSAGE,
    code: PAYMENT_GATE_CODE,
    actionUrl: SETTINGS_PATH,
  });
  return true;
}

/** Returns true when the response has been terminated with a 402. */
export async function rejectIfSellerHasNoPayout(
  res: Response,
  userId: string
): Promise<boolean> {
  if (!(await isPaymentMethodSchemaReady())) return false;
  if (await hasVerifiedPayout(userId)) return false;
  res.status(402).json({
    error: PAYOUT_GATE_MESSAGE,
    code: PAYOUT_GATE_CODE,
    actionUrl: SETTINGS_PATH,
  });
  return true;
}

/**
 * Shipping-enabled listings settle through escrow, so the seller must be able to
 * receive a payout before the listing goes live. Local-pickup-only listings are
 * exempt.
 */
export function listingNeedsPayoutMethod(listing: {
  allowPastomatas?: boolean;
}): boolean {
  return listing.allowPastomatas === true;
}

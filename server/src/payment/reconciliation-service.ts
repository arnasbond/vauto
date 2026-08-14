/**
 * Financial reconciliation — snapshot cents MUST equal accepted offer cents.
 * Fail-closed on mismatch (422 Unprocessable Financial Entity).
 */

import type { TxQueryable } from "../transaction/repository.js";
import { FinancialReconciliationError } from "./types.js";

export type ReconciliationFacts = {
  dealSnapshotId: string;
  acceptedOfferId: string;
  snapshotAmountCents: number;
  offerAmountCents: number;
  currency: "EUR";
  buyerId: string;
  sellerId: string;
  listingId: string;
};

/**
 * Load deal snapshot + accepted offer and assert integer-cent equality.
 * Amount for payment intents MUST come from snapshotAmountCents only.
 */
export async function reconcileSnapshotAgainstAcceptedOffer(
  db: TxQueryable,
  transactionId: string
): Promise<ReconciliationFacts> {
  const snap = await db.query<{
    id: string;
    accepted_offer_id: string;
    amount_cents: number;
    currency: string;
    buyer_id: string;
    seller_id: string;
    listing_id: string;
  }>(
    `SELECT id, accepted_offer_id, amount_cents, currency, buyer_id, seller_id, listing_id
     FROM vauto_deal_snapshots
     WHERE transaction_id = $1
     LIMIT 1`,
    [transactionId]
  );
  const s = snap.rows[0];
  if (!s) {
    throw new FinancialReconciliationError(0, 0);
  }

  const offer = await db.query<{
    id: string;
    amount_cents: number;
    status: string;
  }>(
    `SELECT id, amount_cents, status
     FROM vauto_offers
     WHERE id = $1
     LIMIT 1`,
    [s.accepted_offer_id]
  );
  const o = offer.rows[0];
  if (!o || o.status !== "ACCEPTED") {
    throw new FinancialReconciliationError(Number(s.amount_cents), 0);
  }

  const snapshotAmountCents = Number(s.amount_cents);
  const offerAmountCents = Number(o.amount_cents);

  if (
    !Number.isInteger(snapshotAmountCents) ||
    !Number.isInteger(offerAmountCents) ||
    snapshotAmountCents <= 0 ||
    offerAmountCents <= 0 ||
    snapshotAmountCents !== offerAmountCents ||
    s.currency !== "EUR"
  ) {
    throw new FinancialReconciliationError(
      snapshotAmountCents,
      offerAmountCents
    );
  }

  return {
    dealSnapshotId: s.id,
    acceptedOfferId: o.id,
    snapshotAmountCents,
    offerAmountCents,
    currency: "EUR",
    buyerId: s.buyer_id,
    sellerId: s.seller_id,
    listingId: s.listing_id,
  };
}

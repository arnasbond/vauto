/**
 * Stage 13C — listing vertical authority (server).
 * Client-declared vertical is never used.
 */

import type { TxQueryable } from "../transaction/repository.js";
import {
  DealCapabilityDeniedError,
  assertDealActionAllowed,
  assertNegotiationAction,
  capabilitiesForListing,
  dealActionsForListing,
  deriveDealNegotiationState,
  fulfillmentHintsFromCapabilities,
  resolveListingVertical,
  whoseTurn,
  type DealAction,
  type DealNegotiationState,
  type FulfillmentHint,
} from "../shared/marketplace-domain/deal-actions.js";
import type { CategoryCapabilities, VerticalId } from "../shared/marketplace-domain/types.js";

export class DealNotFoundError extends Error {
  readonly code = "DEAL_NOT_FOUND" as const;
  readonly httpStatus = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "DealNotFoundError";
  }
}

/** Server-authoritative payment initiation is only legal in these 11A statuses. */
export const PRIVILEGED_PAYMENT_TX_STATUSES = [
  "AGREED",
  "PAYMENT_PENDING",
] as const;

export class DealPaymentStateError extends Error {
  readonly code = "DEAL_PAYMENT_STATE" as const;
  readonly httpStatus = 422;
  constructor(public readonly transactionStatus: string) {
    super(`Payment is not allowed in transaction status ${transactionStatus}`);
    this.name = "DealPaymentStateError";
  }
}

export type ListingDealRecord = {
  id: string;
  sellerId: string;
  title: string;
  category: string | null;
  attributes: Record<string, unknown>;
  status: string | null;
};

export async function loadListingDealRecord(
  db: TxQueryable,
  listingId: string
): Promise<ListingDealRecord | null> {
  const rows = await db.query<{
    id: string;
    seller_id: string | null;
    title: string | null;
    category: string | null;
    attributes: Record<string, unknown> | null;
    status: string | null;
  }>(
    `SELECT id, seller_id, title, category, attributes, status
     FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  const row = rows.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    sellerId: String(row.seller_id ?? ""),
    title: String(row.title ?? listingId),
    category: row.category,
    attributes:
      row.attributes && typeof row.attributes === "object" ? row.attributes : {},
    status: row.status,
  };
}

export function listingVerticalContext(
  listing: ListingDealRecord | null,
  clientClaimedVertical?: unknown
): {
  verticalId: VerticalId | null;
  capabilities: CategoryCapabilities;
  allowedActions: readonly DealAction[];
  fulfillment: FulfillmentHint;
} {
  const verticalId = resolveListingVertical(listing ?? undefined, clientClaimedVertical);
  const capabilities = capabilitiesForListing(listing ?? undefined, clientClaimedVertical);
  return {
    verticalId,
    capabilities,
    allowedActions: dealActionsForListing(listing ?? undefined, clientClaimedVertical),
    fulfillment: fulfillmentHintsFromCapabilities(capabilities),
  };
}

export function assertListingDealAction(
  listing: ListingDealRecord | null,
  action: DealAction,
  clientClaimedVertical?: unknown
): VerticalId | null {
  return assertDealActionAllowed(listing ?? undefined, action, clientClaimedVertical);
}

export function negotiationFromOffers(
  transactionStatus: string,
  offers: Array<{ status: string; parentOfferId: string | null; createdByRole?: "BUYER" | "SELLER" }>
): {
  state: DealNegotiationState;
  turn: "BUYER" | "SELLER" | "NONE";
} {
  const state = deriveDealNegotiationState({ transactionStatus, offers });
  const pending = [...offers].reverse().find((o) => o.status === "PENDING");
  return {
    state,
    turn: whoseTurn({
      state,
      pendingCreatedByRole: pending?.createdByRole ?? null,
    }),
  };
}

export function assertNegotiationOrThrow(
  state: DealNegotiationState,
  action: DealAction
): void {
  assertNegotiationAction(state, action);
}

export { DealCapabilityDeniedError };

/**
 * Stage 13C — capability-driven Deal Room actions, negotiation SM, money.
 * Reads 13A capabilities; does not change registry semantics.
 * Negotiation state is NOT the 11J payment ledger.
 */

import { CANONICAL_VERTICAL_ATTR_KEY } from "./listing-flow";
import { resolveVerticalId } from "./legacy";
import { getCategoryCapabilities } from "./queries";
import type { CategoryCapabilities, VerticalId } from "./types";

export const UNIVERSAL_DEAL_ROOM_VERSION = "13C.1" as const;

export const DEAL_ACTIONS = [
  "OFFER",
  "COUNTER_OFFER",
  "ACCEPT",
  "REJECT",
  "CANCEL",
  "INITIATE_PAYMENT",
  "APPOINTMENT",
  "APPLICATION",
  "CONTACT",
] as const;

export type DealAction = (typeof DEAL_ACTIONS)[number];

export const DEAL_NEGOTIATION_STATES = [
  "OPEN",
  "OFFERED",
  "COUNTERED",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
] as const;

export type DealNegotiationState = (typeof DEAL_NEGOTIATION_STATES)[number];

export const DEAL_CURRENCY = "EUR" as const;
export const MIN_OFFER_CENTS = 1;
/** 99 999 999,99 € — overflow guard, integer cents only. */
export const MAX_OFFER_CENTS = 9_999_999_999;

const ACCEPTED_TX_STATUSES = new Set([
  "AGREED",
  "PAYMENT_PENDING",
  "PAID",
  "SHIPPING_PENDING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "SERVICE_SCHEDULED",
  "SERVICE_PERFORMED",
  "CUSTOMER_CONFIRMED",
]);

const CANCELLED_TX_STATUSES = new Set(["CANCELLED", "EXPIRED"]);

export type ListingVerticalSource = {
  category?: unknown;
  attributes?: unknown;
  verticalId?: unknown;
  vertical?: unknown;
};

export type OfferHistoryItem = {
  status: string;
  parentOfferId: string | null;
  createdByRole?: "BUYER" | "SELLER";
};

/**
 * Canonical vertical from the listing record only.
 * Client-declared verticalId / vertical / buyerId are ignored.
 */
export function resolveListingVertical(
  listing: ListingVerticalSource | null | undefined,
  clientClaimedVertical?: unknown
): VerticalId | null {
  void clientClaimedVertical;
  if (!listing) return null;
  const attrs =
    listing.attributes && typeof listing.attributes === "object"
      ? (listing.attributes as Record<string, unknown>)
      : {};
  return (
    resolveVerticalId(attrs[CANONICAL_VERTICAL_ATTR_KEY]) ??
    resolveVerticalId(listing.category) ??
    resolveVerticalId(listing.verticalId) ??
    resolveVerticalId(listing.vertical) ??
    null
  );
}

export function capabilitiesForListing(
  listing: ListingVerticalSource | null | undefined,
  clientClaimedVertical?: unknown
): CategoryCapabilities {
  const verticalId = resolveListingVertical(listing, clientClaimedVertical);
  return getCategoryCapabilities(verticalId);
}

/** Capability → allowed deal mutations. No `if (category === "auto")`. */
export function dealActionsFromCapabilities(
  caps: CategoryCapabilities
): readonly DealAction[] {
  const actions: DealAction[] = ["CANCEL"];
  if (caps.supportsOffers && caps.supportsPrice) {
    actions.push("OFFER", "ACCEPT", "REJECT");
  }
  if (caps.supportsOffers && caps.supportsNegotiation && caps.supportsPrice) {
    actions.push("COUNTER_OFFER");
  }
  if (caps.supportsPlatformPayment) {
    actions.push("INITIATE_PAYMENT");
  }
  if (caps.supportsAppointments) {
    actions.push("APPOINTMENT");
  }
  if (caps.supportsApplications) {
    actions.push("APPLICATION", "CONTACT");
  }
  return [...new Set(actions)];
}

export function dealActionsForListing(
  listing: ListingVerticalSource | null | undefined,
  clientClaimedVertical?: unknown
): readonly DealAction[] {
  return dealActionsFromCapabilities(
    capabilitiesForListing(listing, clientClaimedVertical)
  );
}

export function isDealActionAllowed(
  listing: ListingVerticalSource | null | undefined,
  action: DealAction,
  clientClaimedVertical?: unknown
): boolean {
  return dealActionsForListing(listing, clientClaimedVertical).includes(action);
}

const NEGOTIATION_EDGES: Readonly<
  Record<DealNegotiationState, readonly DealNegotiationState[]>
> = {
  OPEN: ["OFFERED", "CANCELLED"],
  OFFERED: ["COUNTERED", "ACCEPTED", "REJECTED", "CANCELLED"],
  COUNTERED: ["COUNTERED", "ACCEPTED", "REJECTED", "CANCELLED"],
  REJECTED: ["OFFERED", "CANCELLED"],
  ACCEPTED: [],
  CANCELLED: [],
};

export function isNegotiationTransitionAllowed(
  from: DealNegotiationState,
  to: DealNegotiationState
): boolean {
  return NEGOTIATION_EDGES[from].includes(to);
}

export function actionToNegotiationTarget(
  action: DealAction
): DealNegotiationState | null {
  switch (action) {
    case "OFFER":
      return "OFFERED";
    case "COUNTER_OFFER":
      return "COUNTERED";
    case "ACCEPT":
      return "ACCEPTED";
    case "REJECT":
      return "REJECTED";
    case "CANCEL":
      return "CANCELLED";
    default:
      return null;
  }
}

export function deriveDealNegotiationState(input: {
  transactionStatus: string;
  offers: readonly OfferHistoryItem[];
}): DealNegotiationState {
  const status = String(input.transactionStatus ?? "");
  if (CANCELLED_TX_STATUSES.has(status)) return "CANCELLED";
  if (ACCEPTED_TX_STATUSES.has(status)) return "ACCEPTED";
  if (input.offers.some((o) => o.status === "ACCEPTED")) return "ACCEPTED";

  const pending = [...input.offers].reverse().find((o) => o.status === "PENDING");
  if (pending) {
    return pending.parentOfferId ? "COUNTERED" : "OFFERED";
  }
  const last = input.offers[input.offers.length - 1];
  if (last?.status === "REJECTED") return "REJECTED";
  return "OPEN";
}

export function whoseTurn(input: {
  state: DealNegotiationState;
  pendingCreatedByRole: "BUYER" | "SELLER" | null;
}): "BUYER" | "SELLER" | "NONE" {
  if (input.state === "OPEN" || input.state === "REJECTED") return "BUYER";
  if (input.state === "OFFERED" || input.state === "COUNTERED") {
    if (input.pendingCreatedByRole === "BUYER") return "SELLER";
    if (input.pendingCreatedByRole === "SELLER") return "BUYER";
  }
  return "NONE";
}

export type OfferMoney = { amountCents: number; currency: "EUR" };

export function assertValidOfferMoney(input: {
  amountCents: unknown;
  currency?: unknown;
}): OfferMoney {
  if (typeof input.amountCents !== "number" || !Number.isInteger(input.amountCents)) {
    throw new DealMoneyError("amount_cents_must_be_integer");
  }
  if (input.amountCents < MIN_OFFER_CENTS) {
    throw new DealMoneyError("amount_cents_must_be_positive");
  }
  if (input.amountCents > MAX_OFFER_CENTS) {
    throw new DealMoneyError("amount_cents_exceeds_max");
  }
  if (input.currency != null && input.currency !== DEAL_CURRENCY) {
    throw new DealMoneyError("currency_must_be_EUR");
  }
  return { amountCents: input.amountCents, currency: DEAL_CURRENCY };
}

/**
 * Parse UI euro input with integer arithmetic only (no parseFloat money).
 * Accepts "500", "500,00", "500.50".
 */
export function parseEuroInputToCents(raw: unknown): number | null {
  const text = String(raw ?? "").trim().replace(/\s/g, "");
  if (!text) return null;
  const m = text.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number(m[1]);
  if (!Number.isInteger(whole) || whole < 0) return null;
  const frac = (m[2] ?? "00").padEnd(2, "0");
  const centsPart = Number(frac);
  if (!Number.isInteger(centsPart) || centsPart < 0 || centsPart > 99) return null;
  const total = whole * 100 + centsPart;
  if (!Number.isInteger(total) || total < MIN_OFFER_CENTS || total > MAX_OFFER_CENTS) {
    return null;
  }
  return total;
}

/** Lithuanian UI: space before €. */
export function formatDealCentsLt(cents: number | null | undefined): string {
  if (cents == null || !Number.isInteger(cents)) return "—";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const body = frac === "00" ? grouped : `${grouped},${frac}`;
  return `${neg ? "−" : ""}${body} €`;
}

export class DealMoneyError extends Error {
  readonly code = "DEAL_MONEY_INVALID" as const;
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "DealMoneyError";
  }
}

export class DealCapabilityDeniedError extends Error {
  readonly code = "DEAL_CAPABILITY_DENIED" as const;
  readonly httpStatus = 403;
  constructor(
    public readonly action: DealAction,
    public readonly verticalId: VerticalId | null
  ) {
    super(`Deal action ${action} is not allowed for vertical ${verticalId ?? "unknown"}`);
    this.name = "DealCapabilityDeniedError";
  }
}

export class DealNegotiationStateError extends Error {
  readonly code = "DEAL_INVALID_TRANSITION" as const;
  readonly httpStatus = 422;
  constructor(
    public readonly from: DealNegotiationState,
    public readonly to: DealNegotiationState
  ) {
    super(`Invalid deal transition ${from} -> ${to}`);
    this.name = "DealNegotiationStateError";
  }
}

export function assertDealActionAllowed(
  listing: ListingVerticalSource | null | undefined,
  action: DealAction,
  clientClaimedVertical?: unknown
): VerticalId | null {
  const verticalId = resolveListingVertical(listing, clientClaimedVertical);
  if (!isDealActionAllowed(listing, action, clientClaimedVertical)) {
    throw new DealCapabilityDeniedError(action, verticalId);
  }
  return verticalId;
}

export function assertNegotiationAction(
  state: DealNegotiationState,
  action: DealAction
): void {
  const target = actionToNegotiationTarget(action);
  if (!target) return;
  if (!isNegotiationTransitionAllowed(state, target)) {
    throw new DealNegotiationStateError(state, target);
  }
}

export type FulfillmentHint = {
  shipping: boolean;
  pickup: boolean;
  appointments: boolean;
  deposit: boolean;
  deliveryTracking: boolean;
};

export function fulfillmentHintsFromCapabilities(
  caps: CategoryCapabilities
): FulfillmentHint {
  return {
    shipping: caps.supportsShipping,
    pickup: caps.supportsPickup,
    appointments: caps.supportsAppointments,
    deposit: caps.supportsDeposit,
    deliveryTracking: caps.supportsDeliveryTracking,
  };
}

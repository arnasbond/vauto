import { getAuthHeaders } from "@/lib/auth/session";
import { getDataApiBaseUrl, initDataApiConfig } from "@/lib/api/config";
import { mapHttpError, type TrustHttpError } from "@/lib/http-trust";

export type DealApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: TrustHttpError };

async function dealFetch<T>(
  path: string,
  opts?: RequestInit & { context?: "review" | "deal" | "generic" }
): Promise<DealApiResult<T>> {
  await initDataApiConfig();
  const base = getDataApiBaseUrl();
  if (!base) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: "API neprijungtas. Sandorio kambarys veikia tik su serveriu.",
      },
    };
  }
  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(opts?.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: mapHttpError(res.status, text, opts?.context ?? "deal"),
      };
    }
    if (res.status === 204 || !text) return { ok: true, data: null as T, status: res.status };
    return { ok: true, data: JSON.parse(text) as T, status: res.status };
  } catch {
    return { ok: false, error: mapHttpError(undefined) };
  }
}

function idem() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `12a-${crypto.randomUUID()}`
    : `12a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type DealRoomPayload = {
  transaction: { id: string; state: string; version: number };
  listing: {
    id: string;
    title: string;
    thumbnail: string | null;
    askingPriceCents: number | null;
    currency: "EUR";
  };
  buyer: { userId: string; displayName: string; role: "BUYER" };
  seller: { userId: string; displayName: string; role: "SELLER" };
  activeOffer: {
    id: string;
    amountCents: number;
    status: string;
    version: number;
  } | null;
  agreementSnapshot: { amountCents: number; listingTitle: string } | null;
  allowedActions: string[];
  viewerRole: "BUYER" | "SELLER";
  transactionVersion: number;
};

export type DeliveryPayload = {
  delivery: {
    trackingCode: string;
    terminalId: string | null;
    status: string;
    carrier: string;
    trackingUrl: string | null;
  };
  transactionStatus: string;
  messageLt: string | null;
};

export type DisputePayload = {
  dispute: {
    status: string;
    reason: string;
    description: string;
    evidenceJson: {
      trackingCode: string | null;
      evidenceManifestHash: string | null;
      fundsFreezeState: string;
    } | null;
  };
  transactionStatus: string;
  messageLt: string | null;
};

export type ReviewRow = {
  id: string;
  transactionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type ReputationPayload = {
  userId: string;
  ratingAverage: number | null;
  totalReviewsCount: number;
  reviews: ReviewRow[];
};

export async function apiListMyTransactions() {
  return dealFetch<{
    transactions: Array<{
      id: string;
      listingId: string;
      buyerId: string;
      sellerId: string;
      status: string;
      currentPrice: number | null;
      viewerRole: "BUYER" | "SELLER";
      updatedAt: string;
    }>;
  }>("/api/transactions");
}

export async function apiStartListingDeal(listingId: string) {
  return dealFetch<{ transaction: { id: string; status: string } }>(
    `/api/listings/${encodeURIComponent(listingId)}/transactions`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiGetDealRoom(transactionId: string) {
  return dealFetch<DealRoomPayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/deal-room`
  );
}

export async function apiCreateOffer(transactionId: string, amountCents: number) {
  return dealFetch<{ offer: { id: string }; transaction: { status: string } }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/offers`,
    {
      method: "POST",
      body: JSON.stringify({ amountCents, currency: "EUR", idempotencyKey: idem() }),
    }
  );
}

export async function apiAcceptOffer(offerId: string, expectedVersion: number) {
  return dealFetch<{ transaction: { id: string; status: string } }>(
    `/api/offers/${encodeURIComponent(offerId)}/accept`,
    {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: idem(), expectedVersion }),
    }
  );
}

export async function apiCreatePaymentIntent(transactionId: string) {
  return dealFetch<{ paymentIntent?: { amountCents: number; status: string } }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/payment-intent`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiCreateStripeIntent(transactionId: string) {
  return dealFetch<{
    clientSecret: string;
    stripePaymentIntentId: string;
    status: string;
    amountCents: number;
  }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/payment-intent/stripe-intent`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiGetPaymentIntent(transactionId: string) {
  return dealFetch<{
    paymentIntent?: { status: string; amountCents: number; transferStatus?: string };
  }>(`/api/transactions/${encodeURIComponent(transactionId)}/payment-intent`);
}

export async function apiCreateOmnivaLabel(
  transactionId: string,
  input: { trackingCode?: string; terminalId?: string }
) {
  return dealFetch<DeliveryPayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/delivery/label`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: idem(),
        carrier: "OMNIVA",
        terminalId: input.terminalId || null,
        trackingCode: input.trackingCode || null,
      }),
    }
  );
}

export async function apiGetTracking(transactionId: string) {
  return dealFetch<DeliveryPayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/delivery/tracking`
  );
}

export async function apiSyncCarrier(transactionId: string) {
  return dealFetch<DeliveryPayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/delivery/sync-status`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiConfirmDelivery(transactionId: string) {
  return dealFetch<DeliveryPayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/delivery/confirm`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiCompleteTransaction(transactionId: string) {
  return dealFetch<{ transaction: { status: string } }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/complete`,
    { method: "POST", body: JSON.stringify({ idempotencyKey: idem() }) }
  );
}

export async function apiOpenDispute(
  transactionId: string,
  input: { reason: string; description: string }
) {
  return dealFetch<DisputePayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/disputes/open`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: idem(),
        reason: input.reason,
        description: input.description,
      }),
    }
  );
}

export async function apiGetDispute(transactionId: string) {
  return dealFetch<DisputePayload>(
    `/api/transactions/${encodeURIComponent(transactionId)}/disputes`
  );
}

export async function apiSubmitVerifiedReview(
  transactionId: string,
  input: { rating: number; comment?: string }
) {
  return dealFetch<{ review: ReviewRow }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/reviews`,
    {
      method: "POST",
      context: "review",
      body: JSON.stringify({
        rating: input.rating,
        ...(input.comment ? { comment: input.comment } : {}),
      }),
    }
  );
}

export async function apiListTransactionReviews(transactionId: string) {
  return dealFetch<{ reviews: ReviewRow[] }>(
    `/api/transactions/${encodeURIComponent(transactionId)}/reviews`,
    { context: "review" }
  );
}

export async function apiGetUserReputation(userId: string) {
  return dealFetch<ReputationPayload>(
    `/api/users/${encodeURIComponent(userId)}/reputation`,
    { context: "generic" }
  );
}

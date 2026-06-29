import type { SellerReview } from "@/lib/types";
import { getDataApiBaseUrl, isDataApiEnabled } from "@/lib/api/config";
import type { ApiResult } from "@/lib/api/client";
import { getAuthHeaders } from "@/lib/auth/session";

async function authedFetch<T>(
  path: string,
  opts?: RequestInit
): Promise<ApiResult<T>> {
  const base = getDataApiBaseUrl();
  if (!base) return { ok: false, error: "API not configured" };
  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(opts?.headers as Record<string, string>),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || res.statusText, status: res.status };
    }
    if (res.status === 204) return { ok: true, data: null as T };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function apiFetchReviews(): Promise<ApiResult<SellerReview[]>> {
  return authedFetch<SellerReview[]>("/api/reviews");
}

export async function apiSubmitReview(
  review: SellerReview
): Promise<ApiResult<SellerReview>> {
  return authedFetch<SellerReview>("/api/reviews", {
    method: "POST",
    body: JSON.stringify(review),
  });
}

export async function apiTopUpWallet(
  amount: number
): Promise<ApiResult<{ walletBalance: number; mode?: string }>> {
  return authedFetch<{ walletBalance: number; mode?: string }>(
    "/api/wallet/top-up",
    {
      method: "POST",
      body: JSON.stringify({ amount }),
    }
  );
}

export async function apiPromoteListing(
  listingId: string,
  cost: number,
  tier: number
): Promise<
  ApiResult<{ walletBalance: number; listing: import("@/lib/types").Listing }>
> {
  return authedFetch(`/api/listings/${listingId}/promote`, {
    method: "POST",
    body: JSON.stringify({ cost, tier }),
  });
}

export async function apiGetVapidPublicKey(): Promise<
  ApiResult<{ enabled: boolean; publicKey?: string }>
> {
  const base = getDataApiBaseUrl();
  if (!base) return { ok: true, data: { enabled: false } };
  return authedFetch("/api/push/vapid-public-key");
}

export async function apiSubscribePush(subscription: PushSubscriptionJSON): Promise<ApiResult<{ ok: boolean }>> {
  return authedFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
}

export async function apiSyncAlertQueries(
  queries: string[]
): Promise<ApiResult<{ ok: boolean }>> {
  return authedFetch("/api/push/alert-queries", {
    method: "PUT",
    body: JSON.stringify({ queries }),
  });
}

export async function apiFetchAlertQueries(): Promise<
  ApiResult<{ queries: string[] }>
> {
  return authedFetch<{ queries: string[] }>("/api/push/alert-queries");
}

export async function apiRegisterFcmToken(
  token: string,
  platform: string
): Promise<ApiResult<{ ok: boolean }>> {
  return authedFetch("/api/user/push-token", {
    method: "POST",
    body: JSON.stringify({ token, device_type: platform }),
  });
}

export function isWalletApiAvailable(): boolean {
  return isDataApiEnabled();
}

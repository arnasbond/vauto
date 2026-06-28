import type { NegotiationTwinConfig } from "@/lib/types";

export interface BargainTwinRequest {
  buyerMessage: string;
  listingPrice: number;
  minPrice: number;
  listingTitle: string;
  sellerName: string;
  sellerApproved?: boolean;
  autoNegotiationEnabled?: boolean;
}

/** Ar leidžiama autonominė deryba pagal pardavėjo taisykles */
export function canRunAutoNegotiation(
  twin: NegotiationTwinConfig | undefined,
  listingMinPrice?: number
): boolean {
  if (!twin?.enabled) return false;
  const min = twin.minPrice || listingMinPrice || 0;
  if (min <= 0) return false;
  return twin.sellerApproved !== false;
}

export function resolveTwinMinPrice(
  twin: NegotiationTwinConfig | undefined,
  listing?: { minNegotiationPrice?: number; price: number }
): number {
  if (twin?.minPrice && twin.minPrice > 0) return twin.minPrice;
  if (listing?.minNegotiationPrice && listing.minNegotiationPrice > 0) {
    return listing.minNegotiationPrice;
  }
  return Math.max(1, Math.round((listing?.price ?? 0) * 0.85));
}

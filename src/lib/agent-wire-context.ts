import { isGenericListingDraftTitle } from "@vauto/shared/listing-organism";

/**
 * P0 — client request boundary for the seller agent stream.
 *
 * The generic seed („Naujas skelbimas“ / „Drabužių skelbimas“ / empty title)
 * is UI-only start state. It must NEVER cross the wire as an authoritative
 * existing draft, and the current turn's locked price must never synthesize a
 * price-carrier draft out of it — a fresh first sell turn has to reach the
 * server WITHOUT any listingDraft so it is routed through fresh-create
 * extraction (title/category/price/city/condition/attributes from the user's
 * text, which is the single fact authority).
 */
export type WireListingDraft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  contact?: string;
  attributes?: Record<string, string> | undefined;
  allowPastomatas?: boolean;
  listingFlowState?: string;
  orderedImageUrls?: string[];
};

export function resolveListingDraftForWire(input: {
  baseDraft?: WireListingDraft | null;
  lockedPrice?: number | null;
}): WireListingDraft | undefined {
  const base = input.baseDraft;
  if (!base) return undefined;
  if (isGenericListingDraftTitle(base.title)) return undefined;
  const locked = input.lockedPrice;
  if (locked != null && locked > 0) {
    return { ...base, price: locked };
  }
  return base;
}

/**
 * Stage 10K — server-authoritative loaders for valuation / score.
 * Client MUST NOT supply observations, seller, demand, or transaction payloads.
 */

import { getListingForEmbedding, getListings, getUser } from "../../repository.js";
import { query } from "../../db.js";
import type { ApiListing, ApiUser } from "../../types.js";
import type {
  MarketCategory,
  MarketObservation,
  MarketSubject,
} from "../../market-intelligence/types.js";
import type {
  DemandEvent,
  DemandInput,
  ListingQualityInput,
  SellerTrustInput,
  TransactionConfidenceInput,
} from "../../vauto-score/types.js";
import { isPublicSearchableListing } from "../search/catalog-filter.js";
import { apiListingToSearchRecord } from "./catalog-adapters.js";

/** Injectable ports for HTTP/integration tests (production = repository defaults). */
export type Stage10DataPorts = {
  getListing: (id: string) => Promise<ApiListing | null>;
  getListings: () => Promise<ApiListing[]>;
  getUser: (id: string) => Promise<ApiUser | null>;
  queryListingEvents: (
    listingId: string
  ) => Promise<
    Array<{ type: string; created_at: Date | string; user_id: string | null }>
  >;
};

const defaultPorts: Stage10DataPorts = {
  getListing: getListingForEmbedding,
  getListings,
  getUser,
  queryListingEvents: async (listingId) =>
    query(
      `SELECT type, created_at, user_id
       FROM listing_events
       WHERE listing_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [listingId]
    ),
};

let ports: Stage10DataPorts = { ...defaultPorts };

export function setStage10DataPortsForTests(
  partial: Partial<Stage10DataPorts>
): void {
  ports = { ...ports, ...partial };
}

export function resetStage10DataPorts(): void {
  ports = { ...defaultPorts };
}

export type AuthoritativeListingAccess =
  | { ok: true; listing: ApiListing }
  | { ok: false; status: 404 | 403; error: string };

function attrStr(
  attrs: ApiListing["attributes"],
  key: string
): string | null {
  const v = attrs?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function attrNum(
  attrs: ApiListing["attributes"],
  key: string
): number | null {
  const v = attrs?.[key];
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export function mapListingCategory(category: string): MarketCategory {
  const c = String(category ?? "").toLowerCase();
  if (
    c.includes("auto") ||
    c.includes("vehicle") ||
    c.includes("moto") ||
    c === "cars"
  ) {
    return "vehicles";
  }
  if (
    c.includes("phone") ||
    c.includes("electr") ||
    c.includes("comp") ||
    c.includes("laptop")
  ) {
    return "electronics";
  }
  if (c.includes("home") || c.includes("bald") || c.includes("furniture")) {
    return "home";
  }
  if (c.includes("fashion") || c.includes("cloth") || c.includes("aprang")) {
    return "clothing";
  }
  if (!c) return "other";
  return "other";
}

export function listingToMarketSubject(listing: ApiListing): MarketSubject {
  const attrs = listing.attributes;
  return {
    category: mapListingCategory(listing.category),
    brand: attrStr(attrs, "brand") ?? attrStr(attrs, "make"),
    model: attrStr(attrs, "model"),
    year: attrNum(attrs, "year"),
    location: listing.location,
    condition: attrStr(attrs, "condition"),
    attributes: attrs ? { ...attrs } : undefined,
  };
}

/** Resolve listing for authenticated caller — public OK; private/banned only for owner. */
export async function loadAuthoritativeListing(
  listingId: string,
  requestUserId: string
): Promise<AuthoritativeListingAccess> {
  const listing = await ports.getListing(listingId);
  if (!listing) return { ok: false, status: 404, error: "Not found" };

  const rec = apiListingToSearchRecord(listing);
  const isOwner = listing.sellerId === requestUserId;
  if (listing.banned && !isOwner) {
    return { ok: false, status: 404, error: "Not found" };
  }
  if (!isPublicSearchableListing(rec) && !isOwner) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, listing };
}

/**
 * Build market observations from live DB listings (asking prices).
 * Never accepts client-supplied comps.
 */
export async function loadMarketObservationsForListing(
  subjectListing: ApiListing,
  opts?: { limit?: number }
): Promise<MarketObservation[]> {
  const subject = listingToMarketSubject(subjectListing);
  const all = await ports.getListings();
  const limit = Math.min(opts?.limit ?? 80, 200);
  const nowIso = new Date().toISOString();
  const out: MarketObservation[] = [];

  for (const l of all) {
    if (l.id === subjectListing.id) continue;
    const rec = apiListingToSearchRecord(l);
    if (!isPublicSearchableListing(rec)) continue;
    const cat = mapListingCategory(l.category);
    if (cat !== subject.category) continue;
    const brand = attrStr(l.attributes, "brand") ?? attrStr(l.attributes, "make");
    if (subject.brand && brand) {
      if (brand.toLowerCase() !== subject.brand.toLowerCase()) continue;
    }
    const model = attrStr(l.attributes, "model");
    const price = Number(l.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      id: l.id,
      category: cat,
      brand,
      model,
      year: attrNum(l.attributes, "year"),
      location: l.location,
      condition: attrStr(l.attributes, "condition"),
      price,
      priceSource: "ASKING_PRICE",
      observedAt: l.createdAt || nowIso,
      dedupeKey: `${l.sellerId}:${brand}:${model}:${price}`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function listingToQualityInput(listing: ApiListing): ListingQualityInput {
  const attrs = listing.attributes ?? {};
  const keys = Object.keys(attrs).filter((k) => {
    const v = attrs[k];
    return v != null && String(v).trim() !== "";
  });
  const expected = ["brand", "model", "year", "condition"];
  return {
    photoCount: Array.isArray(listing.images)
      ? listing.images.length
      : listing.image
        ? 1
        : 0,
    descriptionLength: (listing.description ?? "").length,
    titleLength: listing.title.length,
    presentAttributeKeys: keys,
    expectedAttributeKeys: expected,
  };
}

export async function loadSellerTrustInput(
  sellerId: string
): Promise<SellerTrustInput> {
  const user: ApiUser | null = await ports.getUser(sellerId);
  if (!user) {
    return {
      isNewSeller: true,
      accountAgeDays: null,
      completedTransactions: null,
      successfulDeliveries: null,
      disputeRate: null,
      identityVerified: null,
    };
  }
  const verified = Boolean(
    user.role === "business" ||
      (user.companyCode && String(user.companyCode).trim())
  );
  const sold = Number(user.soldCount ?? 0);
  let accountAgeDays: number | null = null;
  if (user.createdAt) {
    const createdMs = Date.parse(user.createdAt);
    if (Number.isFinite(createdMs)) {
      accountAgeDays = Math.max(
        0,
        Math.floor((Date.now() - createdMs) / (24 * 60 * 60 * 1000))
      );
    }
  }
  return {
    identityVerified: verified,
    accountAgeDays,
    completedTransactions: Number.isFinite(sold) ? sold : null,
    // Delivery / dispute layers land in Stage 11 — unknown ≠ positive.
    successfulDeliveries: null,
    disputeRate: null,
    isNewSeller: sold === 0,
  };
}

export async function loadDemandInputForListing(
  listing: ApiListing
): Promise<DemandInput> {
  const events: DemandEvent[] = [];
  try {
    const rows = await ports.queryListingEvents(listing.id);
    for (const r of rows) {
      const t = String(r.type);
      let mapped: DemandEvent["type"] | null = null;
      if (t === "view") mapped = "view";
      else if (t === "contact" || t === "inquiry") mapped = "inquiry";
      else if (t === "favorite" || t === "share_story") mapped = "favorite";
      if (!mapped) continue;
      events.push({
        type: mapped,
        at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        actorId: r.user_id,
      });
    }
  } catch {
    // table may be empty / query fail — score treats missing demand as N/A
  }
  return {
    events,
    listingOwnerId: listing.sellerId,
    listingCreatedAt: listing.createdAt,
    now: new Date(),
  };
}

export async function loadTransactionConfidence(
  listing: ApiListing
): Promise<TransactionConfidenceInput> {
  return {
    // Escrow / buyer-protection production layer = Stage 11 — do not invent.
    escrowAvailable: null,
    omnivaAvailable: Boolean(listing.allowPastomatas),
    buyerProtectionAvailable: null,
  };
}

/** Reject client attempts to inject authoritative score/valuation fields. */
export function rejectClientAuthoritativePayload(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const forbidden = [
    "observations",
    "seller",
    "demand",
    "transaction",
    "askingPriceVsMarket",
    "marketValuation",
    "listing",
    "subject",
  ] as const;
  for (const k of forbidden) {
    if (k in b && b[k] != null) {
      return `client_${k}_forbidden`;
    }
  }
  if ("askingPrice" in b && b.askingPrice != null) {
    return "client_askingPrice_forbidden";
  }
  return null;
}

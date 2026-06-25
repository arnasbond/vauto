import type { ApiListing } from "./types.js";
import { DEMO_LISTINGS, type DemoListingRow } from "./demo-listings.js";

function demoRowToApiListing(row: DemoListingRow, index: number): ApiListing {
  const createdAt = new Date(Date.UTC(2026, 5, 1 + (index % 28), 8, 0)).toISOString();
  const expiresAt = new Date(Date.UTC(2026, 8, 1 + (index % 28), 8, 0)).toISOString();
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    price: row.price,
    priceLabel: row.price_label,
    location: row.location,
    distanceKm: row.distance_km,
    image: row.image,
    category: row.category,
    tags: row.tags ?? [],
    contact: row.contact,
    hasVideo: row.has_video ?? false,
    description: row.description,
    attributes: row.attributes,
    createdAt,
    expiresAt,
    status: "active",
    banned: false,
    vinVerified: row.vin_verified ?? false,
    providerVerified: row.provider_verified ?? false,
    promoted: false,
  };
}

const DEMO_API_LISTINGS: ApiListing[] = DEMO_LISTINGS.map(demoRowToApiListing);

/** DB rows override demo fields; demo catalog always fills missing IDs. */
export function mergeDbListingsWithDemoCatalog(fromDb: ApiListing[]): ApiListing[] {
  const byId = new Map(DEMO_API_LISTINGS.map((listing) => [listing.id, listing]));
  for (const item of fromDb) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getDemoApiListings(): ApiListing[] {
  return DEMO_API_LISTINGS;
}

export function toAgentListingSummary(
  listing: ApiListing
): {
  id: string;
  title: string;
  price: number;
  category: string;
  location: string;
  description?: string;
} {
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    category: listing.category,
    location: listing.location,
    description: listing.description,
  };
}

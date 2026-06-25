import type { ApiListing } from "./types.js";
import { DEMO_LISTINGS, type DemoListingRow } from "./demo-listings.js";

function isValidImage(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\/.+/i.test(url.trim());
}

function coalesceApiImage(
  incoming: string | undefined,
  fallback: string | undefined,
  demoRow?: DemoListingRow
): string {
  if (isValidImage(incoming)) return incoming.trim();
  if (isValidImage(fallback)) return fallback.trim();
  if (isValidImage(demoRow?.image)) return demoRow.image.trim();
  return "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop&auto=format";
}

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
  const demoById = new Map(DEMO_LISTINGS.map((row) => [row.id, row]));
  const byId = new Map(DEMO_API_LISTINGS.map((listing) => [listing.id, listing]));
  for (const item of fromDb) {
    const existing = byId.get(item.id);
    const demoRow = demoById.get(item.id);
    const merged = existing ? { ...existing, ...item } : item;
    byId.set(item.id, {
      ...merged,
      image: coalesceApiImage(item.image, existing?.image, demoRow),
    });
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

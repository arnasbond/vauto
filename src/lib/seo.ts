import type { Listing } from "@/lib/types";
import { regionalizeTitle } from "@/lib/local-seo";
import { SITE_URL } from "@/lib/site-url";
import {
  buildListingOgMeta,
  listingSharePath,
  listingShareUrl,
} from "@vauto/shared/listing-og";

export { SITE_URL } from "@/lib/site-url";
export { listingSharePath, listingShareUrl } from "@vauto/shared/listing-og";

const LT_CHAR_MAP: Record<string, string> = {
  ą: "a",
  č: "c",
  ę: "e",
  ė: "e",
  į: "i",
  š: "s",
  ų: "u",
  ū: "u",
  ž: "z",
  Ą: "a",
  Č: "c",
  Ę: "e",
  Ė: "e",
  Į: "i",
  Š: "s",
  Ų: "u",
  Ū: "u",
  Ž: "z",
};

export function slugify(text: string): string {
  return text
    .split("")
    .map((c) => LT_CHAR_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function generateListingSlug(title: string, location: string): string {
  const parts = [title, location.split(",")[0]?.trim() ?? location]
    .map(slugify)
    .filter(Boolean);
  return parts.join("-").slice(0, 80);
}

export interface ListingSeoMetadata {
  title: string;
  description: string;
  og: {
    title: string;
    description: string;
    image: string;
    url: string;
    type: string;
    siteName: string;
  };
}

export function findListingBySlug(
  listings: readonly Listing[],
  slug: string
): Listing | undefined {
  return listings.find((l) => l.slug === slug || l.id === slug);
}

export function generateListingMetadata(listing: Listing): ListingSeoMetadata {
  const regionalTitle = regionalizeTitle(listing.title, listing.location);
  const meta = buildListingOgMeta(
    {
      id: listing.id,
      title: regionalTitle,
      price: listing.price,
      priceLabel: listing.priceLabel,
      location: listing.location,
      slug: listing.slug,
      category: listing.category,
      description: listing.description,
      images: listing.images,
      imageTitle: listing.imageTitle,
      attributes: listing.attributes as Record<string, unknown> | undefined,
    },
    SITE_URL
  );

  return {
    title: meta.title,
    description: meta.description,
    og: {
      title: meta.ogTitle,
      description: meta.ogDescription,
      image: meta.ogImage,
      url: meta.canonicalUrl,
      type: "website",
      siteName: meta.siteName,
    },
  };
}

/**
 * In-app navigation path — query id is safest for client routers.
 * External share / OG canonical uses listingSharePath (pretty /listing/:id/).
 */
export function listingPath(listing: Listing): string {
  if (listing.id?.trim()) {
    return `/listing/?id=${encodeURIComponent(listing.id.trim())}`;
  }
  const slug =
    listing.slug?.trim() || generateListingSlug(listing.title, listing.location);
  return `/listing/?slug=${encodeURIComponent(slug)}`;
}

/** Pretty path for share + crawlers — Vercel bot rewrite → OG edge. */
export function listingPrettyPath(listing: Listing): string {
  return listingSharePath(listing);
}

export function sellerPath(sellerId: string): string {
  return `/seller/?id=${encodeURIComponent(sellerId)}`;
}

export function sellerPrettyPath(sellerId: string): string {
  return `/seller/${encodeURIComponent(sellerId)}/`;
}

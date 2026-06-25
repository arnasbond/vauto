import type { Listing } from "@/lib/types";
import { regionalizeTitle } from "@/lib/local-seo";

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

const SITE_URL = "https://vauto-chi.vercel.app";

export function generateListingMetadata(listing: Listing): ListingSeoMetadata {
  const priceText = listing.priceLabel ?? `${listing.price}€`;
  const regionalTitle = regionalizeTitle(listing.title, listing.location);
  const title = `${regionalTitle} — ${priceText} | VAUTO`;
  const city = listing.location.split(",")[0]?.trim() || "Lietuva";
  const description =
    listing.description?.slice(0, 140) ??
    `${regionalTitle} — skelbimas ${city}. Kaina ${priceText}. Peržiūrėkite ir skambinkite per Vauto.`;

  return {
    title,
    description,
    og: {
      title: `${regionalTitle} — ${priceText}`,
      description: `${description} ${city} regionas.`,
      image: listing.images[0] ?? "",
      url: `${SITE_URL}${listingPath(listing)}`,
      type: "product",
      siteName: "Vauto",
    },
  };
}

export function listingPath(listing: Listing): string {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  // Query-based path works for statically exported app (no per-slug HTML file required).
  return `/listing/?slug=${encodeURIComponent(slug)}`;
}

/** Pretty path for legacy/static slugs — requires Vercel rewrite to /listing/?slug= */
export function listingPrettyPath(listing: Listing): string {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  return `/listing/${slug}/`;
}

export function sellerPath(sellerId: string): string {
  return `/seller/?id=${encodeURIComponent(sellerId)}`;
}

export function sellerPrettyPath(sellerId: string): string {
  return `/seller/${encodeURIComponent(sellerId)}/`;
}

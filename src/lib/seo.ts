import type { Listing } from "@/lib/types";
import { regionalizeTitle } from "@/lib/local-seo";
import { publicListingImageUrls } from "@/lib/listing-public-gallery";
import { SITE_URL } from "@/lib/site-url";

export { SITE_URL } from "@/lib/site-url";

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
  const priceText = listing.priceLabel ?? `${listing.price} €`;
  const city = listing.location.split(",")[0]?.trim() || "Lietuva";
  const regionalTitle = regionalizeTitle(listing.title, listing.location);
  const action =
    listing.category === "jobs" ? "Siūloma" : "Parduodamas";
  const title = `${action} ${regionalTitle} už ${priceText} | ${city} - VAUTO`;
  const description =
    listing.description?.slice(0, 155) ??
    `${action} ${regionalTitle} ${city} už ${priceText}. Peržiūrėkite skelbimą ir susisiekite per VAUTO.`;

  const ogTitle =
    listing.imageTitle?.trim() ||
    `${regionalTitle} — ${priceText}`;

  return {
    title,
    description,
    og: {
      title: ogTitle,
      description: `${description} ${city} regionas.`,
      image: publicListingImageUrls(listing)[0] ?? listing.images[0] ?? "",
      url: `${SITE_URL}${listingPath(listing)}`,
      type: "website",
      siteName: "VAUTO",
    },
  };
}

export function listingPath(listing: Listing): string {
  // Prefer stable id — works with static export + next dev (no per-slug HTML / no Vercel rewrite needed).
  const id = String(listing.id ?? "").trim();
  if (id) return `/listing/?id=${encodeURIComponent(id)}`;
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  return `/listing/?slug=${encodeURIComponent(slug)}`;
}

/** Pretty path for external SEO / Vercel rewrite → /listing/?slug= */
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

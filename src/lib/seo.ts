import type { Listing } from "@/lib/types";

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
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  const priceText = listing.priceLabel ?? `${listing.price}€`;
  const title = `${listing.title} — ${priceText} | Vauto`;
  const description =
    listing.description?.slice(0, 155) ??
    `${listing.title} parduodamas ${listing.location}. Kaina: ${priceText}. Peržiūrėkite Vauto skelbimų portale.`;

  return {
    title,
    description,
    og: {
      title: `${listing.title} — ${priceText}`,
      description,
      image: listing.image,
      url: `${SITE_URL}/listing/${slug}/`,
      type: "product",
      siteName: "Vauto",
    },
  };
}

export function listingPath(listing: Listing): string {
  const slug = listing.slug ?? generateListingSlug(listing.title, listing.location);
  return `/listing/${slug}/`;
}

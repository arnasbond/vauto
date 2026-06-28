import type { Listing } from "@/lib/types";
import { isAiProxyAvailable } from "@/lib/api/config";
import { getDataApiBaseUrl } from "@/lib/api/config";

export interface ListingShareCopy {
  facebook: string;
  instagram: string;
  hashtags: string[];
  url: string;
}

function fallbackShareCopy(listing: Listing): ListingShareCopy {
  const origin = (
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://vauto.lt"
  ).replace(/\/$/, "");
  const path = listing.slug ? `/listing/${listing.slug}/` : `/listing/${listing.id}/`;
  const url = `${origin}${path}`;
  const price =
    listing.price > 0 ? `${listing.price.toFixed(0)} €` : "Kaina derinama";
  const city = listing.location?.trim() || "Lietuva";
  const attrs = listing.attributes ?? {};
  const brand = String(attrs.brand ?? attrs.make ?? "").trim();
  const size = String(attrs.size ?? attrs.clothingSize ?? "").trim();
  const detail = [brand, size].filter(Boolean).join(" · ");
  const hook = detail ? `${listing.title} (${detail})` : listing.title;

  return {
    facebook: `🔥 ${hook} — ${price}, ${city}! Peržiūrėkite VAUTO: ${url}`,
    instagram: `✨ ${hook}\n💶 ${price} · 📍 ${city}\n👉 ${url}\n#vauto #spinta #${listing.category}`,
    hashtags: ["vauto", "spinta", listing.category],
    url,
  };
}

/** AI Social Share — Gemini pagal Vision atributus (su offline fallback). */
export async function fetchListingShareCopy(
  listing: Listing
): Promise<ListingShareCopy> {
  const fallback = fallbackShareCopy(listing);
  if (!isAiProxyAvailable()) return fallback;

  const base = getDataApiBaseUrl();
  if (!base) return fallback;

  try {
    const res = await fetch(`${base}/api/ai/listing-share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: listing.id,
        slug: listing.slug,
        title: listing.title,
        price: listing.price,
        city: listing.location,
        category: listing.category,
        description: listing.description,
        attributes: listing.attributes,
        imageAlt: listing.title,
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as ListingShareCopy;
    return {
      facebook: data.facebook || fallback.facebook,
      instagram: data.instagram || fallback.instagram,
      hashtags: data.hashtags?.length ? data.hashtags : fallback.hashtags,
      url: data.url || fallback.url,
    };
  } catch {
    return fallback;
  }
}

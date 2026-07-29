import type { Listing } from "@/lib/types";
import { isAiProxyAvailable } from "@/lib/api/config";
import { getDataApiBaseUrl } from "@/lib/api/config";
import { getAuthHeaders } from "@/lib/auth/session";
import { SITE_URL } from "@/lib/site-url";
import {
  categoryHashtags,
  listingShareUrl,
  readStoredSocialShare,
  type SocialShareTone,
} from "@vauto/shared/listing-og";

export type { SocialShareTone };

export interface ListingShareCopy {
  facebook: string;
  instagram: string;
  caption: string;
  hashtags: string[];
  url: string;
  tone: SocialShareTone;
  persisted?: boolean;
}

export const SHARE_TONE_OPTIONS: {
  id: SocialShareTone;
  label: string;
  hint: string;
}[] = [
  { id: "casual", label: "Laisvas", hint: "Emoji, kabliukai" },
  { id: "neutral", label: "Neutralus", hint: "Aiškus ir ramus" },
  { id: "business", label: "Verslui", hint: "Profesionalus tonas" },
];

function fallbackShareCopy(
  listing: Listing,
  tone: SocialShareTone
): ListingShareCopy {
  const url = listingShareUrl(listing, SITE_URL);
  const price =
    listing.price > 0 ? `${listing.price.toFixed(0)} €` : "Kaina derinama";
  const city = listing.location?.trim() || "Lietuva";
  const attrs = listing.attributes ?? {};
  const brand = String(attrs.brand ?? attrs.make ?? "").trim();
  const size = String(attrs.size ?? attrs.clothingSize ?? "").trim();
  const detail = [brand, size].filter(Boolean).join(" · ");
  const hook = detail ? `${listing.title} (${detail})` : listing.title;
  const hashtags = categoryHashtags(listing.category, city);
  const tagLine = hashtags.map((t) => `#${t}`).join(" ");

  let facebook: string;
  let instagram: string;
  if (tone === "business") {
    facebook = `${hook} — ${price}, ${city}. Daugiau: ${url}`;
    instagram = `${hook}\n${price} · ${city}\n${url}\n${tagLine}`;
  } else if (tone === "neutral") {
    facebook = `${hook} · ${price} · ${city}. VAUTO: ${url}`;
    instagram = `${hook}\n${price} · ${city}\n${url}\n${tagLine}`;
  } else {
    facebook = `🔥 ${hook} — ${price}, ${city}! Peržiūrėkite VAUTO: ${url}`;
    instagram = `✨ ${hook}\n💶 ${price} · 📍 ${city}\n👉 ${url}\n${tagLine}`;
  }

  return {
    facebook,
    instagram,
    caption: facebook,
    hashtags,
    url,
    tone,
  };
}

/** AI Social Share — Gemini pagal toną (su offline / cached fallback). */
export async function fetchListingShareCopy(
  listing: Listing,
  opts?: { tone?: SocialShareTone; persist?: boolean; force?: boolean }
): Promise<ListingShareCopy> {
  const tone: SocialShareTone =
    opts?.tone === "neutral" || opts?.tone === "business" ? opts.tone : "casual";

  if (!opts?.force) {
    const stored = readStoredSocialShare(
      listing.attributes as Record<string, unknown> | undefined
    );
    if (stored && stored.tone === tone && stored.caption) {
      return {
        facebook: stored.facebook || stored.caption,
        instagram: stored.instagram || stored.caption,
        caption: stored.caption,
        hashtags: stored.hashtags.length
          ? stored.hashtags
          : categoryHashtags(listing.category, listing.location),
        url: listingShareUrl(listing, SITE_URL),
        tone,
        persisted: true,
      };
    }
  }

  const fallback = fallbackShareCopy(listing, tone);
  if (!isAiProxyAvailable()) return fallback;

  const base = getDataApiBaseUrl();
  if (!base) return fallback;

  try {
    const res = await fetch(`${base}/api/ai/listing-share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
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
        tone,
        persist: Boolean(opts?.persist),
      }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as ListingShareCopy & { ok?: boolean };
    return {
      facebook: data.facebook || fallback.facebook,
      instagram: data.instagram || fallback.instagram,
      caption: data.caption || data.facebook || fallback.caption,
      hashtags: data.hashtags?.length ? data.hashtags : fallback.hashtags,
      url: data.url || fallback.url,
      tone: data.tone || tone,
      persisted: Boolean(data.persisted),
    };
  } catch {
    return fallback;
  }
}

/**
 * Universal listing Open Graph + social share helpers.
 * Shared by Next client SEO and Express OG edge (keep in sync with server/src/shared).
 */

export type SocialShareTone = "casual" | "neutral" | "business";

export const SOCIAL_SHARE_ATTR_KEY = "_socialShare";

export interface StoredSocialShare {
  tone: SocialShareTone;
  caption: string;
  facebook?: string;
  instagram?: string;
  hashtags: string[];
  updatedAt: string;
}

export interface ListingOgInput {
  id: string;
  title: string;
  price: number;
  priceLabel?: string | null;
  location: string;
  slug?: string | null;
  category: string;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  imageTitle?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface ListingOgMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  siteName: string;
  priceText: string;
  city: string;
  highlights: string[];
}

const DEFAULT_ORIGIN = "https://www.vauto.lt";
const DEFAULT_OG_IMAGE = `${DEFAULT_ORIGIN}/icon-512.png`;

const CATEGORY_HASHTAGS: Record<string, string[]> = {
  vehicles: ["autobazaras", "automobiliai", "transportas"],
  transport: ["autobazaras", "automobiliai", "transportas"],
  real_estate: ["bustas", "nt", "nekilnojamasturtas"],
  services: ["paslaugos", "meistras"],
  jobs: ["darbas", "darbo"],
  home: ["namai", "baldai", "bustas"],
  clothing: ["mada", "spinta", "rubai"],
  electronics: ["elektronika", "gadgetai"],
  tools: ["irankiai", "statyba"],
  rental: ["nuoma", "nuomuojama"],
  other: ["parduodu", "skelbimas"],
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function resolveAppOrigin(origin?: string | null): string {
  const envOrigin =
    typeof process !== "undefined"
      ? process.env.APP_ORIGIN?.trim() ||
        process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
        ""
      : "";
  const chosen = (origin && String(origin).trim()) || envOrigin || DEFAULT_ORIGIN;
  return chosen.replace(/\/+$/, "") || DEFAULT_ORIGIN;
}

export function absoluteAssetUrl(url: string | null | undefined, origin?: string): string {
  const base = resolveAppOrigin(origin);
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return `${base}/icon-512.png`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

/** Stable share/canonical path — id preferred so crawlers + SPA both resolve. */
export function listingSharePath(listing: Pick<ListingOgInput, "id" | "slug">): string {
  const id = String(listing.id ?? "").trim();
  if (id) return `/listing/${encodeURIComponent(id)}/`;
  const slug = String(listing.slug ?? "").trim();
  if (slug) return `/listing/${encodeURIComponent(slug)}/`;
  return "/";
}

export function listingShareUrl(
  listing: Pick<ListingOgInput, "id" | "slug">,
  origin?: string
): string {
  return `${resolveAppOrigin(origin)}${listingSharePath(listing)}`;
}

function pickCoverImage(listing: ListingOgInput): string {
  if (Array.isArray(listing.images) && listing.images[0]) return String(listing.images[0]);
  if (listing.image) return String(listing.image);
  const attrs = listing.attributes ?? {};
  const gallery = attrs.galleryUrls ?? attrs.images ?? attrs.imageUrls;
  if (Array.isArray(gallery) && gallery[0]) return String(gallery[0]);
  if (typeof gallery === "string" && gallery.trim()) return gallery.trim();
  return DEFAULT_OG_IMAGE;
}

function attrString(attrs: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!attrs) return "";
  for (const key of keys) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (Array.isArray(v) && v.length) return String(v[0]).trim();
  }
  return "";
}

/** Category-agnostic highlight chips for OG description (year, m², brand…). */
export function collectListingHighlights(listing: ListingOgInput, limit = 3): string[] {
  const attrs = listing.attributes ?? {};
  const cat = String(listing.category ?? "").toLowerCase();
  const out: string[] = [];

  const push = (label: string) => {
    const t = label.trim();
    if (t && !out.includes(t) && out.length < limit) out.push(t);
  };

  if (cat === "vehicles" || cat === "transport") {
    const year = attrString(attrs, "year");
    const mileage = attrString(attrs, "mileage", "odometer", "km");
    const fuel = attrString(attrs, "fuel", "fuelType");
    if (year) push(year);
    if (mileage) push(mileage.includes("km") ? mileage : `${mileage} km`);
    if (fuel) push(fuel);
  } else if (cat === "real_estate" || cat === "rental") {
    const area = attrString(attrs, "area", "areaM2", "sqm", "size");
    const rooms = attrString(attrs, "rooms", "roomCount");
    const floor = attrString(attrs, "floor");
    if (area) push(area.includes("m") ? area : `${area} m²`);
    if (rooms) push(`${rooms} kamb.`);
    if (floor) push(`${floor} aukšt.`);
  } else if (cat === "jobs" || cat === "services") {
    const rate = attrString(attrs, "rate", "hourlyRate", "salary");
    const exp = attrString(attrs, "experience", "seniority");
    if (rate) push(rate);
    if (exp) push(exp);
  } else {
    const brand = attrString(attrs, "brand", "make", "manufacturer");
    const size = attrString(attrs, "size", "clothingSize");
    const condition = attrString(attrs, "condition", "state");
    if (brand) push(brand);
    if (size) push(size);
    if (condition) push(condition);
  }

  return out;
}

export function categoryHashtags(category: string, city?: string): string[] {
  const cat = String(category ?? "other").toLowerCase();
  const pack = CATEGORY_HASHTAGS[cat] ?? CATEGORY_HASHTAGS.other;
  const tags = ["vauto", "lietuva", ...pack];
  const cityTag = String(city ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  if (cityTag && cityTag.length >= 3) tags.push(cityTag);
  return [...new Set(tags)].slice(0, 10);
}

export function buildListingOgMeta(
  listing: ListingOgInput,
  origin?: string
): ListingOgMeta {
  const base = resolveAppOrigin(origin);
  const priceText =
    (listing.priceLabel && String(listing.priceLabel).trim()) ||
    (listing.price > 0 ? `${Math.round(listing.price)} €` : "Kaina derinama");
  const city = String(listing.location ?? "")
    .split(",")[0]
    ?.trim() || "Lietuva";
  const cat = String(listing.category ?? "").toLowerCase();
  const action = cat === "jobs" ? "Siūloma" : cat === "services" ? "Siūloma" : "Parduodama";
  const titleBase = String(listing.title ?? "Skelbimas").trim() || "Skelbimas";
  const highlights = collectListingHighlights(listing);
  const highlightSuffix = highlights.length ? ` · ${highlights.join(" · ")}` : "";

  const ogTitle =
    (listing.imageTitle && String(listing.imageTitle).trim()) ||
    `${titleBase} — ${priceText}`;

  const rawDesc = String(listing.description ?? "").replace(/\s+/g, " ").trim();
  const description =
    rawDesc.slice(0, 155) ||
    `${action} ${titleBase} · ${priceText} · ${city}${highlightSuffix}. Peržiūrėkite skelbimą VAUTO.`;

  const ogDescription = `${priceText} · ${city}${highlightSuffix}. ${description}`.slice(0, 200);

  return {
    title: `${action} ${titleBase} už ${priceText} | ${city} - VAUTO`,
    description,
    ogTitle,
    ogDescription,
    ogImage: absoluteAssetUrl(pickCoverImage(listing), base),
    canonicalUrl: listingShareUrl(listing, base),
    siteName: "VAUTO",
    priceText,
    city,
    highlights,
  };
}

export function renderListingOgHtml(meta: ListingOgMeta, opts?: { redirectMs?: number }): string {
  const redirectMs = opts?.redirectMs ?? 0;
  const title = escapeAttr(meta.ogTitle);
  const desc = escapeAttr(meta.ogDescription);
  const image = escapeAttr(meta.ogImage);
  const url = escapeAttr(meta.canonicalUrl);
  const site = escapeAttr(meta.siteName);
  const pageTitle = escapeAttr(meta.title);
  const refresh =
    redirectMs >= 0
      ? `<meta http-equiv="refresh" content="${redirectMs};url=${url}" />`
      : "";

  return `<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${site}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${url}" />
  <meta property="og:locale" content="lt_LT" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${image}" />
  ${refresh}
</head>
<body>
  <p>${escapeAttr(meta.ogTitle)} — <a href="${url}">Atidaryti VAUTO</a></p>
</body>
</html>`;
}

export function readStoredSocialShare(
  attributes?: Record<string, unknown> | null
): StoredSocialShare | null {
  const raw = attributes?.[SOCIAL_SHARE_ATTR_KEY];
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;
  const caption = String(obj.caption ?? "").trim();
  if (!caption) return null;
  const toneRaw = String(obj.tone ?? "casual");
  const tone: SocialShareTone =
    toneRaw === "neutral" || toneRaw === "business" ? toneRaw : "casual";
  return {
    tone,
    caption,
    facebook: obj.facebook ? String(obj.facebook) : undefined,
    instagram: obj.instagram ? String(obj.instagram) : undefined,
    hashtags: Array.isArray(obj.hashtags) ? obj.hashtags.map(String).slice(0, 12) : [],
    updatedAt: String(obj.updatedAt ?? ""),
  };
}

export function mergeSocialShareAttributes(
  attributes: Record<string, unknown> | null | undefined,
  share: StoredSocialShare
): Record<string, unknown> {
  return {
    ...(attributes ?? {}),
    // Store as JSON string so it fits legacy attribute maps (string | string[]).
    [SOCIAL_SHARE_ATTR_KEY]: JSON.stringify(share),
  };
}

import type { Listing, ListingCategory } from "@/lib/types";

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&h=600&fit=crop&auto=format`;

/** Verified live Unsplash photo IDs (HTTP 200 as of 2026-06). */
const CATEGORY_FALLBACK: Record<ListingCategory, string> = {
  vehicles: UNSPLASH("photo-1555215695-3004980ad54e"),
  electronics: UNSPLASH("photo-1511707171634-5f897ff02aa9"),
  services: UNSPLASH("photo-1486262715619-67b85e0b08d3"),
  jobs: UNSPLASH("photo-1497366811353-6870744d04b2"),
  home: UNSPLASH("photo-1617806118233-18e1de247200"),
  clothing: UNSPLASH("photo-1551028719-00167b16eac5"),
  real_estate: UNSPLASH("photo-1560518883-ce09059eeffa"),
  other: UNSPLASH("photo-1571068316344-75bc76f77890"),
};

/** Keyword → Unsplash photo matched to listing content */
const CONTENT_IMAGES: Array<[RegExp, string]> = [
  [/\bbmw\b/i, UNSPLASH("photo-1555215695-3004980ad54e")],
  [/\baudi\b/i, UNSPLASH("photo-1606664515524-ed2f786a0bd6")],
  [/\bmercedes|benz\b/i, UNSPLASH("photo-1617531653332-bd46c24f2068")],
  [/\bvolvo\b/i, UNSPLASH("photo-1617531653332-bd46c24f2068")],
  [/\btoyota\b/i, UNSPLASH("photo-1542362567-b07e54358753")],
  [/\bvolkswagen|\bvw\b/i, UNSPLASH("photo-1542362567-b07e54358753")],
  [/\bskoda\b/i, UNSPLASH("photo-1606664515524-ed2f786a0bd6")],
  [/\bford\b/i, UNSPLASH("photo-1552519507-da3b142c6e3d")],
  [/\bopel\b/i, UNSPLASH("photo-1617531653332-bd46c24f2068")],
  [/\bx5|xc90|xc60|tiguan|q5|glc|rav4|visureig|suv\b/i, UNSPLASH("photo-1606664515524-ed2f786a0bd6")],
  [/\btouring|universal|avantis|passat|octavia|v70\b/i, UNSPLASH("photo-1617531653332-bd46c24f2068")],
  [/\biphone\b/i, UNSPLASH("photo-1592899677977-9c10ca588bbd")],
  [/\bsamsung|galaxy\b/i, UNSPLASH("photo-1511707171634-5f897ff02aa9")],
  [/\bmacbook|mac book\b/i, UNSPLASH("photo-1496181133206-80ce9b88a853")],
  [/\bipad\b/i, UNSPLASH("photo-1544244015-0df4b3ffc6b0")],
  [/\bplaystation|ps5\b/i, UNSPLASH("photo-1585060544812-6b45742d762f")],
  [/\bdyson\b/i, UNSPLASH("photo-1558618666-fcd25c85cd64")],
  [/\bsony\b|ausinės|ausines/i, UNSPLASH("photo-1585060544812-6b45742d762f")],
  [/\bdetailing|plovimas\b/i, UNSPLASH("photo-1486262715619-67b85e0b08d3")],
  [/\bpadang|montavim\b/i, UNSPLASH("photo-1504148455328-c376907d081c")],
  [/\bdiagnostik|obd\b/i, UNSPLASH("photo-1486262715619-67b85e0b08d3")],
  [/\bsupirkim\b/i, UNSPLASH("photo-1487754180451-c456f719a1fc")],
  [/\bdažym|dazym|kėbul|kebul\b/i, UNSPLASH("photo-1492144534655-ae79c964c9d7")],
  [/\bevakuator|kelyje\b/i, UNSPLASH("photo-1487754180451-c456f719a1fc")],
  [/\bbutas|kambar|nt\b|nekilnojam|nuomoju|sklyp|namas\b/i, UNSPLASH("photo-1502672260266-1c1ef2d93688")],
  [/\bdarbas|etat|atlyginim|vairuotoj|programuotoj|buhalter/i, UNSPLASH("photo-1497366811353-6870744d04b2")],
  [/\bdrabu|batai|striuk|suknel|džins|nike|zara|adidas\b/i, UNSPLASH("photo-1551028719-00167b16eac5")],
  [/\bsofa|bald|virtuv|lova|spinta\b/i, UNSPLASH("photo-1617806118233-18e1de247200")],
  [/\bdvirat|vežimėl|įrank|sodas|knyg\b/i, UNSPLASH("photo-1571068316344-75bc76f77890")],
];

export function isValidListingImageUrl(url: unknown): url is string {
  return typeof url === "string" && /^https?:\/\/.+/i.test(url.trim());
}

export function resolveListingImage(
  listing: Pick<Listing, "title" | "category" | "image" | "description">
): string {
  if (isValidListingImageUrl(listing.image)) return listing.image.trim();

  const haystack = `${listing.title} ${listing.description ?? ""}`;
  for (const [pattern, url] of CONTENT_IMAGES) {
    if (pattern.test(haystack)) return url;
  }

  return CATEGORY_FALLBACK[listing.category] ?? CATEGORY_FALLBACK.other;
}

export function coalesceListingImage(
  incoming: string | undefined,
  fallback: string | undefined,
  listing: Pick<Listing, "title" | "category" | "description">
): string {
  if (isValidListingImageUrl(incoming)) return incoming.trim();
  if (isValidListingImageUrl(fallback)) return fallback.trim();
  return resolveListingImage({ ...listing, image: fallback ?? "" });
}

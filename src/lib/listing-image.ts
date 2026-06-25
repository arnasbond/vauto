import type { Listing, ListingCategory } from "@/lib/types";

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&h=600&fit=crop&auto=format`;

const CATEGORY_FALLBACK: Record<ListingCategory, string> = {
  vehicles: UNSPLASH("photo-1555215695-3004980ad54e"),
  electronics: UNSPLASH("photo-1511707171634-5f897ff02aa9"),
  services: UNSPLASH("photo-1486262715619-67b85e0b08d3"),
  jobs: UNSPLASH("photo-1454165804606-c3d57bc86b40"),
  home: UNSPLASH("photo-1555041469-a586c61e9bc7"),
  clothing: UNSPLASH("photo-1445205170230-053b83016050"),
  real_estate: UNSPLASH("photo-1560518883-ce09059eeffa"),
  other: UNSPLASH("photo-1556740734-f6acd7d7d1a6"),
};

/** Keyword → Unsplash photo matched to listing content */
const CONTENT_IMAGES: Array<[RegExp, string]> = [
  [/\bbmw\b/i, UNSPLASH("photo-1555215695-3004980ad54e")],
  [/\baudi\b/i, UNSPLASH("photo-1606664515524-ed2f786a0bd6")],
  [/\bmercedes|benz\b/i, UNSPLASH("photo-1617531653332-bd46c24f2068")],
  [/\bvolvo\b/i, UNSPLASH("photo-1609521263040-82f9f49b7c65")],
  [/\btoyota\b/i, UNSPLASH("photo-1621007940902-bb6befaef932")],
  [/\bvolkswagen|\bvw\b/i, UNSPLASH("photo-1542362567-b07e54358753")],
  [/\bskoda\b/i, UNSPLASH("photo-1606664515524-ed2f786a0bd6")],
  [/\bford\b/i, UNSPLASH("photo-1552519507-da3b142c6e3d")],
  [/\bopel\b/i, UNSPLASH("photo-1552519507-da3b142c6e3d")],
  [/\bx5|xc90|xc60|tiguan|q5|glc|rav4|visureig|suv\b/i, UNSPLASH("photo-1519641471654-76cead78234a")],
  [/\btouring|universal|avantis|passat|octavia|v70\b/i, UNSPLASH("photo-1609521263040-82f9f49b7c65")],
  [/\biphone\b/i, UNSPLASH("photo-1592899677977-9c10ca588bbd")],
  [/\bsamsung|galaxy\b/i, UNSPLASH("photo-1511707171634-5f897ff02aa9")],
  [/\bmacbook|mac book\b/i, UNSPLASH("photo-1496181133206-80ce9b88a853")],
  [/\bipad\b/i, UNSPLASH("photo-1606144042614-b2417e99c4ee")],
  [/\bplaystation|ps5\b/i, UNSPLASH("photo-1606813907291-d86efa9b397e")],
  [/\bdyson\b/i, UNSPLASH("photo-1558618666-fcd25c85cd64")],
  [/\bsony\b|ausinės|ausines/i, UNSPLASH("photo-1585060544812-6b45742d762f")],
  [/\bdetailing|plovimas\b/i, UNSPLASH("photo-1486262715619-67b85e0b08d3")],
  [/\bpadang|montavim\b/i, UNSPLASH("photo-1504148455328-c376907d081c")],
  [/\bdiagnostik|obd\b/i, UNSPLASH("photo-1625047509248-ec889cbff097")],
  [/\bsupirkim\b/i, UNSPLASH("photo-1487754180451-c456f719a1fc")],
  [/\bdažym|dazym|kėbul|kebul\b/i, UNSPLASH("photo-1619642751034-765df69d01c9")],
  [/\bevakuator|kelyje\b/i, UNSPLASH("photo-1621939514649-280e2ee02577")],
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

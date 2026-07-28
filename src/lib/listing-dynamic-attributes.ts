import { INTERNAL_LISTING_ATTR_KEYS } from "@/lib/listing-attributes";
import type { Listing, ListingCategory } from "@/lib/types";
import {
  ATTR_LABEL_LT,
  humanizeAttributeKeyLt,
} from "@vauto/shared/attr-labels";

export interface DynamicAttributeEntry {
  key: string;
  label: string;
  value: string;
}

/** @deprecated Use ATTR_LABEL_LT from @vauto/shared/attr-labels — kept for local re-exports. */
const ATTR_LABEL_HINTS: Record<string, string> = ATTR_LABEL_LT;

/** Fashion-only attribute keys — hide on guitars/electronics/etc. */
const FASHION_ONLY_KEYS = new Set([
  "size",
  "clothingType",
  "fashionCategory",
  "fashionSubcategory",
  "colors",
  "shippingOptions",
]);

const EXTRA_INTERNAL_KEYS = new Set([
  ...INTERNAL_LISTING_ATTR_KEYS,
  "isAiTwinActive",
  "minNegotiationPrice",
  "sellerType",
  "companyName",
  "visibilityTier",
  "_visibilityTier",
  "conductorSources",
  "conductorMergedAt",
  "sellerDisplayName",
  "socialPublishAnonserLt",
  "socialPublishAiAdaptation",
  "socialPublishFacebookGroups",
  "socialPublishFacebook",
  "socialPublishInstagram",
  "socialPublish",
  // Vision / OCR pipeline dumps — never show in PrePublish specs UI.
  "detectedObjects",
  "documentImageUrls",
  "documentImageCount",
  "documentUrls",
  "documentReadable",
  "documentOcrConfidence",
  "documentOcrSoftNote",
  "documentOcrUnclear",
  "sceneContext",
  "factNotes",
  "ocrText",
  "choiceChips",
  "clarificationPrompt",
  "selectedObject",
  "preferredSizes",
  "deferredSalesDescription",
  "salesCopyGenerated",
  "salesCopySource",
  "visionQuotaFallback",
  "sparseSell",
  "fitsOmnivaLocker",
  "estimatedSize",
  "omnivaLockerBlockReason",
  "omnivaBoxSize",
]);

const INTERNAL_LABEL_RE =
  /conductor|social\s*publish|seller\s*display|anonser|ai\s*adaptation|facebook\s*groups|merged\s*at|detected\s*objects|document\s*image|scene\s*context|fact\s*notes|preferred\s*sizes|deferred\s*sales|ocr\s*text|choice\s*chips|clarification/i;

/** Fold key/label for debug-key matching (spaces, camelCase, underscores). */
function normalizeAttrDebugToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isPublicDynamicAttributeKey(key: string): boolean {
  const k = key.trim();
  if (!k || k.startsWith("_")) return false;
  if (EXTRA_INTERNAL_KEYS.has(k)) return false;
  if (/^(contact|email|sellername|sellerdisplayname|phone|location|fashioncategory)$/i.test(k)) {
    return false;
  }
  if (/^conductor/i.test(k) || /^socialPublish/i.test(k)) return false;
  const folded = normalizeAttrDebugToken(k);
  // Match camelCase, spaced, and ALL-CAPS labels from vision dumps.
  if (
    /detected objects|document image(?: urls| count)?|document image|scene context|fact notes|preferred sizes|deferred sales(?: description)?|ocr text|choice chips|clarification prompt/.test(
      folded
    )
  ) {
    return false;
  }
  return true;
}

export function humanizeAttributeKey(key: string): string {
  void ATTR_LABEL_HINTS;
  return humanizeAttributeKeyLt(key);
}

function normalizeAttrValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const joined = value.map(String).map((s) => s.trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  const s = String(value).trim();
  if (!s || /^(true|false|null|undefined)$/i.test(s)) return null;
  return s;
}

function isFashionOnlyForCategory(key: string, category?: ListingCategory): boolean {
  if (!FASHION_ONLY_KEYS.has(key)) return false;
  // HARD: hide fashion keys unless category is explicitly clothing
  // (undefined category must NOT leak S/M/L/XL onto auto/parts).
  return category !== "clothing";
}

/** Schema-less: only non-empty public key→value pairs from the attribute map. */
export function getDynamicAttributeEntries(
  attributes: Record<string, unknown> | null | undefined,
  category?: ListingCategory
): DynamicAttributeEntry[] {
  if (!attributes) return [];
  const out: DynamicAttributeEntry[] = [];
  const seenLabels = new Set<string>();

  for (const [key, raw] of Object.entries(attributes)) {
    if (!isPublicDynamicAttributeKey(key)) continue;
    if (isFashionOnlyForCategory(key, category)) continue;
    const value = normalizeAttrValue(raw);
    if (!value) continue;
    const label = humanizeAttributeKey(key);
    if (INTERNAL_LABEL_RE.test(label) || INTERNAL_LABEL_RE.test(key)) continue;
    const dedupe = label.toLowerCase();
    if (seenLabels.has(dedupe)) continue;
    seenLabels.add(dedupe);
    out.push({ key, label, value });
  }

  return out;
}

export function getDynamicListingDetailRows(
  listing: Pick<Listing, "attributes" | "category" | "title" | "description">
): Array<{ label: string; value: string }> {
  const category =
    typeof (listing as Listing).category === "string"
      ? (listing as Listing).category
      : undefined;
  return getDynamicAttributeEntries(
    listing.attributes as Record<string, unknown>,
    category
  ).map((e) => ({ label: e.label, value: e.value }));
}

const CATEGORY_AI_TAGS: Partial<Record<ListingCategory, string>> = {
  vehicles: "Automobiliai",
  transport: "Transportas",
  electronics: "Elektronika",
  clothing: "Apranga",
  home: "Namai",
  services: "Paslaugos",
  real_estate: "NT",
  jobs: "Darbas",
  tools: "Įrankiai",
  rental: "Nuoma",
  other: "Kita",
};

const FASHION_TAG_RE = /^(apranga|drabu[zž]iai|mada|fashion|xxs|xs|s|m|l|xl|xxl)$/i;

/** Public AI hashtag chips — no internal key:value dumps. */
export function getAiListingTagChips(
  tags: string[] | undefined,
  category?: ListingCategory
): string[] {
  const chips: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    let t = raw.trim().replace(/^#+/, "").trim();
    t = t.replace(/^#{1,6}\s*/, "").trim();
    if (!t) return;
    if (
      /^(contact|email|sellername|sellerdisplayname|phone|location|fashioncategory|conductor|socialpublish)\b/i.test(
        t
      )
    ) {
      return;
    }
    if (INTERNAL_LABEL_RE.test(t)) return;
    if (t.includes(":")) {
      const [k, ...rest] = t.split(":");
      const key = k.trim();
      const val = rest.join(":").trim();
      if (!isPublicDynamicAttributeKey(key)) return;
      if (isFashionOnlyForCategory(key, category)) return;
      t = val || key;
    }
    // Fashion sizes / #Apranga never appear outside clothing (incl. undefined category).
    if (category !== "clothing" && FASHION_TAG_RE.test(t)) return;
    if (category !== "clothing" && /^(xxs|xs|s|m|l|xl|xxl)$/i.test(t)) return;
    // Never show electronics tags on automotive listings.
    if (
      category &&
      (category === "vehicles" || category === "transport") &&
      /^(elektronika|electronics|telefonas|mobil[uū]s)$/i.test(t)
    ) {
      return;
    }
    const norm = t.toLowerCase();
    if (seen.has(norm)) return;
    seen.add(norm);
    chips.push(t);
  };

  for (const tag of tags ?? []) push(tag);

  // Never inject #Apranga for non-clothing verticals.
  if (category && category !== "clothing" && CATEGORY_AI_TAGS[category]) {
    push(CATEGORY_AI_TAGS[category]!);
  } else if (category === "clothing") {
    push("Apranga");
  }

  return chips.slice(0, 12);
}

export function formatAiTagChip(tag: string): string {
  const t = tag.trim().replace(/^#+/, "");
  return t ? `#${t.replace(/\s+/g, "")}` : "";
}

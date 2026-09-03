import { INTERNAL_LISTING_ATTR_KEYS } from "@/lib/listing-attributes";
import type { Listing, ListingCategory } from "@/lib/types";
import { classifyFashionKind, FASHION_KIND_LABELS } from "@/lib/clothing-catalog";
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
  "_canonicalVertical",
  // Legacy untrusted edit markers (B3) — kept in the internal set so they can
  // never render as public specs even if a stale payload still carries them;
  // canonical authority uses the trusted typed `editedByUser` state instead.
  "locationEditedByUser",
  "titleEditedByUser",
  "priceEditedByUser",
  "descriptionEditedByUser",
  "specSource",
  "specConfidence",
  "catalogNote",
  "catalogModificationId",
  "catalogModificationLabel",
  "catalogAlternatives",
  "appraisalMinPrice",
  "appraisalMaxPrice",
  "appraisalOptimalPrice",
  "appraisalScore",
  "appraisalSampleSize",
  "minNegotiationPrice",
  "marketMedianPrice",
  "optimalPrice",
  // Phase 2C VIN review markers — internal draft-only state, never public specs.
  "vinCandidate",
  "vinCandidateSource",
  "vinCandidateConfidence",
  "vinConflictValue",
  "vinConflictSource",
  "vinConflict",
  "vinUncertain",
  "vinReviewId",
  "vinConfirmed",
  "vinConfirmedSource",
  "vinConfirmedReviewId",
  "vinReviewState",
  // Phase 2D field-conflict markers — deterministic clarification state
  // (resolveYearConflictPatch), never public specs.
  "yearConflict",
  "yearConflictCandidate",
  // F9 — canonical fact-conflict markers (price/city/condition) — draft-only.
  "priceConflict",
  "priceConflictCandidate",
  "cityConflict",
  "cityConflictCandidate",
  "conditionConflict",
  "conditionConflictCandidate",
]);

const INTERNAL_LABEL_RE =
  /conductor|social\s*publish|seller\s*display|anonser|ai\s*adaptation|facebook\s*groups|merged\s*at|detected\s*objects|document\s*image|scene\s*context|fact\s*notes|preferred\s*sizes|deferred\s*sales|ocr\s*text|choice\s*chips|clarification|vin\s*(candidate|conflict|uncertain|review|confirmed)/i;

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
    /detected objects|document image(?: urls| count)?|document image|scene context|fact notes|preferred sizes|deferred sales(?: description)?|ocr text|choice chips|clarification prompt|vin candidate|vin conflict|vin uncertain|vin review|vin confirmed/.test(
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

/** Core vehicle tech fields — always editable in PrePublish (even when empty). */
export const PREPUBLISH_VEHICLE_ALWAYS_ATTRS: ReadonlyArray<{
  key: string;
  label: string;
  placeholder: string;
}> = [
  { key: "powerKw", label: "Galia (kW)", placeholder: "pvz. 77" },
  { key: "fuelType", label: "Kuras", placeholder: "Benzinas / Dyzelinas…" },
  { key: "mileage", label: "Rida (km)", placeholder: "pvz. 185 000" },
  { key: "engine", label: "Variklis", placeholder: "pvz. 1.6" },
  { key: "vin", label: "VIN kodas", placeholder: "17 simbolių VIN" },
];

/** Clothing / fashion — keep core inputs visible while editing (empty ≠ gone). */
export const PREPUBLISH_CLOTHING_ALWAYS_ATTRS: ReadonlyArray<{
  key: string;
  label: string;
  placeholder: string;
}> = [
  { key: "brand", label: "Prekės ženklas", placeholder: "Zara, Nike…" },
  { key: "size", label: "Dydis", placeholder: "S / 40 / 104 cm" },
  { key: "condition", label: "Būklė", placeholder: "Labai gera…" },
  { key: "clothingType", label: "Tipas", placeholder: "Suknelės, Striukės…" },
  { key: "colors", label: "Spalva", placeholder: "Juoda, Balta…" },
];

/** Electronics — core tech inputs stay editable when cleared. */
export const PREPUBLISH_ELECTRONICS_ALWAYS_ATTRS: ReadonlyArray<{
  key: string;
  label: string;
  placeholder: string;
}> = [
  { key: "manufacturer", label: "Gamintojas", placeholder: "Gamintojas…" },
  { key: "deviceModel", label: "Modelis", placeholder: "Modelis…" },
  { key: "condition", label: "Būklė", placeholder: "Būklė…" },
];

function alwaysAttrsForCategory(
  category?: ListingCategory
): ReadonlyArray<{ key: string; label: string; placeholder: string }> {
  if (category === "vehicles" || category === "transport") {
    return PREPUBLISH_VEHICLE_ALWAYS_ATTRS;
  }
  if (category === "clothing") return PREPUBLISH_CLOTHING_ALWAYS_ATTRS;
  // Electronics: do not force empty phone-shaped sticky fields (Apple / iPhone /
  // 128 GB) onto printers and other non-phone gear — filled Vision attrs still show.
  if (category === "electronics") return [];
  return [];
}

function listingLooksLikePhone(
  title?: string,
  description?: string,
  attributes?: Record<string, unknown> | null
): boolean {
  const blob = [
    title,
    description,
    attributes?.deviceModel,
    attributes?.manufacturer,
    attributes?.brand,
  ]
    .map((v) => String(v ?? ""))
    .join(" ");
  return /\b(iphone|smartphone|telefonas|galaxy\s*[a-z]?\d|pixel\s*\d|xiaomi\s*redmi|huawei\s*p)\b/i.test(
    blob
  );
}

/** Schema demo defaults that must not stick on printers / cameras / etc. */
function isPhoneSchemaDefaultValue(key: string, value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (key === "manufacturer" && /^apple$/i.test(v)) return true;
  if (key === "deviceModel" && /\biphone\b/i.test(v)) return true;
  if (
    (key === "storageCapacity" || key === "storage") &&
    /^(64|128|256)\s*GB$/i.test(v)
  ) {
    return true;
  }
  return false;
}

/**
 * PrePublish editor list: show filled public attrs + category sticky cores that
 * already have values (or vehicle/clothing always cores). Never inject empty
 * phone placeholder rows for unrelated electronics.
 */
export function getPrePublishEditableAttributeEntries(
  attributes: Record<string, unknown> | null | undefined,
  category?: ListingCategory,
  opts?: { title?: string; description?: string }
): Array<DynamicAttributeEntry & { placeholder?: string }> {
  const phoneContext = listingLooksLikePhone(
    opts?.title,
    opts?.description,
    attributes
  );
  const filledRaw = getDynamicAttributeEntries(attributes, category);
  const filled = phoneContext
    ? filledRaw
    : filledRaw.filter(
        (entry) => !isPhoneSchemaDefaultValue(entry.key, entry.value)
      );
  const always = alwaysAttrsForCategory(category);

  if (always.length === 0) {
    // Filled-only for electronics / other — hide empty hardcoded placeholders.
    return filled.slice(0, 16);
  }

  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const out: Array<DynamicAttributeEntry & { placeholder?: string }> = [];

  for (const alwaysField of always) {
    const raw = attributes?.[alwaysField.key];
    const value = normalizeAttrValue(raw) ?? "";
    // Prefer mileage over mileageKm when both exist.
    const alt =
      alwaysField.key === "mileage"
        ? normalizeAttrValue(attributes?.mileageKm) ?? ""
        : alwaysField.key === "fuelType"
          ? normalizeAttrValue(attributes?.fuel) ?? ""
          : alwaysField.key === "colors"
            ? normalizeAttrValue(attributes?.color) ?? ""
            : "";
    const resolved = value || alt;
    out.push({
      key: alwaysField.key,
      label: alwaysField.label,
      value: resolved,
      placeholder: alwaysField.placeholder,
    });
    seenKeys.add(alwaysField.key);
    if (alwaysField.key === "mileage") seenKeys.add("mileageKm");
    if (alwaysField.key === "fuelType") seenKeys.add("fuel");
    if (alwaysField.key === "colors") seenKeys.add("color");
    seenLabels.add(alwaysField.label.toLowerCase());
  }

  for (const entry of filled) {
    if (seenKeys.has(entry.key)) continue;
    const dedupe = entry.label.toLowerCase();
    if (seenLabels.has(dedupe)) continue;
    seenKeys.add(entry.key);
    seenLabels.add(dedupe);
    out.push(entry);
  }

  return out.slice(0, 16);
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
  vehicles: "Transportas",
  transport: "Transportas",
  electronics: "Elektronika",
  clothing: "Mada",
  home: "Namai ir buitis",
  services: "Paslaugos",
  real_estate: "Nekilnojamas turtas",
  jobs: "Darbas",
  tools: "Namai ir buitis",
  rental: "Kita",
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

  // Never inject #Mada for non-clothing verticals.
  if (category && category !== "clothing" && CATEGORY_AI_TAGS[category]) {
    push(CATEGORY_AI_TAGS[category]!);
  } else if (category === "clothing") {
    // F7: the clothing category presents itself as „Mada“ with an optional
    // kind subcategory chip (Drabužiai / Avalynė / Aksesuarai) derived from
    // the existing fashion architecture — never guessed when unknown.
    const kind = classifyFashionKind({ text: (tags ?? []).join(" ") });
    push(kind ? FASHION_KIND_LABELS[kind] : "Mada");
  }

  return chips.slice(0, 12);
}

export function formatAiTagChip(tag: string): string {
  const t = tag.trim().replace(/^#+/, "");
  return t ? `#${t.replace(/\s+/g, "")}` : "";
}

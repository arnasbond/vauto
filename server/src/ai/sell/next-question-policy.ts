/**
 * VAUTO AI Maturity — Phase 2B: single highest-value missing-fact question policy.
 *
 * Doctrine: ask at most ONE missing-fact question per turn — the question that most
 * efficiently moves the user toward a trustworthy, publishable listing. VAUTO must
 * demonstrate how little the user needs to do, not how much the AI can ask.
 *
 * Pure, deterministic, explicit inputs/outputs — no LLM, no network, no side effects.
 * Reuses Stage 13A canonical vertical attribute schemas (`shared/marketplace-domain`)
 * for the REQUIRED tier wherever a vertical maps cleanly. Fashion/Goods ("clothing")
 * has no Stage 13A vertical (see `resolveVerticalId("clothing") === null`, enforced by
 * `category-domain.test.ts` test "I") and is therefore modeled independently here,
 * without touching the frozen Stage 13A registry.
 *
 * Four concepts this module keeps structurally distinct (do not blur them):
 *   1. Stage 13A canonical REQUIRED fields    — `shared/marketplace-domain` `required: true`
 *      attributes (or clothing's local required tier). Frozen schema, read-only here.
 *   2. Universal publish BLOCKERS             — `sellerType`, `city`. Not part of any
 *      vertical schema; supplied by the caller as a tiny normalized signal (see
 *      `UniversalBlockers`/`deriveUniversalBlockers`). This module never re-derives
 *      auth/phone/photo gating — `pre-publish-validation.ts` remains authoritative.
 *   3. Phase 2B CORE-IMPORTANT / high-value vertical fields — fields Stage 13A does
 *      NOT mark required, but which this module elevates above blockers/price for a
 *      specific category because they are identity-completing (currently: vehicle
 *      `model` — Stage 13A only marks `make` required for TRANSPORT).
 *   4. Lower-value optional ENRICHMENT        — remaining category facts, ordered
 *      high-to-low value within `IMPORTANT_FIELDS`.
 */

import { getVertical } from "../../shared/marketplace-domain/registry.js";
import type { VerticalId } from "../../shared/marketplace-domain/types.js";

/** Internal listing categories this policy understands (mirrors `RegistryListingCategory`). */
export type NextQuestionCategory =
  | "vehicles"
  | "transport"
  | "real_estate"
  | "electronics"
  | "clothing"
  | "services"
  | "jobs"
  | "home"
  | "tools"
  | "rental"
  | "other";

/** A single field's known state as observed by the caller (chat draft, Stage 10C draft, etc.). */
export type FactState = {
  /** Present/non-empty value. Absent or empty string/array ⇒ treated as missing. */
  value?: unknown;
  /** 0..1. Omitted ⇒ treated as fully confident (1). */
  confidence?: number;
  /** True when two sources materially disagree on this field's value. */
  conflict?: boolean;
};

export type NextQuestionFacts = Record<string, FactState | undefined>;

export type NextQuestionReason =
  | "conflict"
  | "missing_required"
  | "missing_blocker"
  | "uncertain"
  | "missing_important";

export type NextQuestionResult = {
  /** Canonical field key (structural — assert this, not the localized text). */
  field: string;
  reason: NextQuestionReason;
  /** Concise, natural Lithuanian question — never an internal field name. */
  question: string;
} | null;

/**
 * Universal publish blockers (`sellerType`, `city`) — not part of any vertical
 * schema. The caller supplies a small normalized `FactState` per blocker (or
 * omits a key entirely when that blocker does not apply to this surface); this
 * module never re-derives auth/phone/photo readiness itself.
 */
export type UniversalBlockers = {
  sellerType?: FactState;
  city?: FactState;
};

/** Below this confidence, a present value is treated as unresolved/untrusted (not final). */
const UNCERTAIN_CONFIDENCE_THRESHOLD = 0.6;

const CATEGORY_VERTICAL_MAP: Partial<Record<NextQuestionCategory, VerticalId>> = {
  vehicles: "TRANSPORT",
  transport: "TRANSPORT",
  real_estate: "REAL_ESTATE",
  electronics: "ELECTRONICS",
  services: "SERVICES",
  jobs: "JOBS",
};

/** Categories where a direct sale price is a first-class trust/decision fact. */
const PRICE_BEARING_CATEGORIES = new Set<NextQuestionCategory>([
  "vehicles",
  "transport",
  "real_estate",
  "electronics",
  "clothing",
  "home",
  "tools",
  "rental",
  "other",
]);

/**
 * Phase 2B core-important fields: Stage 13A does NOT mark these `required`, but a
 * missing value here makes every subsequent question (blockers, price, enrichment)
 * premature — so they are elevated above universal blockers/price for this category.
 * Currently only vehicle `model` (Stage 13A's TRANSPORT vertical marks `make`
 * required but leaves `model` optional — this table is the honest Phase 2B-only
 * classification, not a silent edit of the frozen Stage 13A schema).
 */
const CORE_IMPORTANT_FIELDS: Record<NextQuestionCategory, readonly string[]> = {
  vehicles: ["model"],
  transport: ["model"],
  real_estate: [],
  electronics: [],
  clothing: [],
  services: [],
  jobs: [],
  home: [],
  tools: [],
  rental: [],
  other: [],
};

/**
 * Buyer-decision-value facts beyond Stage 13A's `required` flag, ordered by priority
 * (high-value first, lower-value enrichment last within each category's list). These
 * are chat-question priorities, not publish-time validation — they do not touch or
 * duplicate the Stage 13A schema.
 */
const IMPORTANT_FIELDS: Record<NextQuestionCategory, readonly string[]> = {
  vehicles: ["mileage", "year", "techInspection", "transmission", "fuelType"],
  transport: ["mileage", "year", "techInspection", "transmission", "fuelType"],
  real_estate: ["heatingType", "rooms", "yearBuilt", "floor"],
  electronics: ["deviceModel", "storage", "warranty"],
  clothing: ["size", "material", "color"],
  services: ["serviceLocation", "duration"],
  jobs: ["salaryMin", "workType"],
  home: [],
  tools: [],
  rental: [],
  other: [],
};

/** Trust-critical fields that must not be treated as final while uncertain. */
const UNCERTAIN_TIER_FIELDS: Record<NextQuestionCategory, readonly string[]> = {
  vehicles: ["vin"],
  transport: ["vin"],
  real_estate: [],
  electronics: [],
  clothing: [],
  services: [],
  jobs: [],
  home: [],
  tools: [],
  rental: [],
  other: [],
};

/** Fashion/Goods ("clothing") has no Stage 13A vertical — required tier defined locally. */
const CLOTHING_REQUIRED_FIELDS: readonly string[] = ["condition"];

const QUESTION_TEXT: Record<string, string> = {
  // Universal (price-bearing decision fact + publish blockers)
  price: "Kokią kainą nustatome eurais — norite greitesnio pardavimo ar aukštesnės kainos?",
  sellerType: "Skelbiate kaip privatus asmuo ar kaip įmonė?",
  city: "Kurį miestą rodyti pirkėjams skelbime?",
  // Transport
  make: "Kokia automobilio markė?",
  model: "Koks automobilio modelis?",
  year: "Kokie automobilio pagaminimo metai?",
  yearConflict:
    "Nurodėte skirtingus pagaminimo metus — kurie yra teisingi?",
  mileage: "Kokia automobilio rida (km)?",
  techInspection: "Iki kada galioja techninė apžiūra?",
  transmission: "Kokia transmisija — mechaninė ar automatinė?",
  fuelType: "Koks variklio kuro tipas?",
  vin: "Ar VIN kodas nurodytas teisingai? Patikslinkite, jei ne.",
  // Real estate
  propertyType: "Koks objekto tipas — butas, namas ar kita?",
  area: "Koks plotas (m²)?",
  location: "Kokiame mieste ar rajone yra objektas?",
  heatingType: "Koks šildymo tipas?",
  rooms: "Kiek kambarių?",
  roomsConflict: "Nurodėte skirtingą kambarių skaičių — kiek iš tiesų kambarių?",
  yearBuilt: "Kokie statybos metai?",
  floor: "Kuriame aukšte?",
  // Electronics
  manufacturer: "Koks gamintojas?",
  condition: "Kokia prekės būklė?",
  deviceModel: "Koks tikslus modelis?",
  storage: "Kokia atmintis / konfigūracija?",
  warranty: "Ar galioja gamintojo garantija?",
  // Fashion / Goods
  size: "Koks dydis?",
  material: "Kokia medžiaga?",
  color: "Kokios spalvos?",
  // Services
  serviceType: "Kokią paslaugą siūlote?",
  pricingType: "Kokia kainodara — fiksuota, valandinė ar sutartinė?",
  serviceLocation: "Kur teikiama paslauga — vietoje, nuotoliu ar konkrečiame mieste?",
  duration: "Koks paslaugos terminas ar prieinamumas?",
  // Jobs
  jobTitle: "Kokios pareigos?",
  employmentType: "Kokia darbo forma — pilnas etatas, dalinis ar kita?",
  salaryMin: "Koks siūlomas atlygis?",
  workType: "Ar darbas biure, nuotoliu, ar hibridinis?",
  workTypeConflict:
    "Nurodėte prieštaringas darbo sąlygas — patikslinkite, ar darbas nuotolinis, biure ar hibridinis?",
};

function isMissing(fact: FactState | undefined): boolean {
  if (!fact) return true;
  const v = fact.value;
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function isUncertain(fact: FactState | undefined): boolean {
  if (!fact || isMissing(fact)) return false;
  const confidence = fact.confidence ?? 1;
  return confidence < UNCERTAIN_CONFIDENCE_THRESHOLD;
}

function requiredFieldsFor(category: NextQuestionCategory): readonly string[] {
  if (category === "clothing") return CLOTHING_REQUIRED_FIELDS;
  const verticalId = CATEGORY_VERTICAL_MAP[category];
  if (!verticalId) return [];
  return getVertical(verticalId)
    .attributes.filter((a) => a.required)
    .map((a) => a.key);
}

/** Question text for a field, honoring a conflict-specific phrasing when one exists. */
function questionFor(field: string, reason: NextQuestionReason): string {
  if (reason === "conflict") {
    const conflictKey = `${field}Conflict`;
    if (QUESTION_TEXT[conflictKey]) return QUESTION_TEXT[conflictKey];
  }
  return QUESTION_TEXT[field] ?? `Ar galite patikslinti: ${field}?`;
}

/**
 * Select the single highest-value missing/uncertain/conflicting fact to ask about next.
 *
 * Deterministic priority contract (identical input ⇒ identical output):
 *   0. CONFLICT          — any field flagged `conflict: true` (checked in canonical field order).
 *   1. UNCERTAIN         — trust/safety-critical fields present but below the confidence
 *                          threshold (e.g. VIN) — never treated as final while unresolved.
 *   2. REQUIRED          — Stage 13A `required` attributes (or clothing's local required tier).
 *   3. CORE-IMPORTANT    — Phase 2B identity-completing fields Stage 13A does not mark
 *                          required (currently: vehicle `model`) — see `CORE_IMPORTANT_FIELDS`.
 *   4. BLOCKER           — universal publish blockers supplied by the caller: `sellerType`
 *                          before `city` (see `UniversalBlockers`).
 *   5. PRICE             — universal sale price, for price-bearing categories (SERVICES/JOBS
 *                          use their own required pricing/salary attributes instead).
 *   6. IMPORTANT         — remaining category-specific buyer-decision-value facts, high-value
 *                          before lower-value enrichment (array order within `IMPORTANT_FIELDS`).
 * Returns null when no important fact is missing — the caller should present the next
 * human-controlled step (e.g. PrePublish) instead of asking another question.
 */
export function selectNextQuestion(input: {
  category: string | null | undefined;
  facts: NextQuestionFacts;
  /** Optional universal publish blockers (sellerType/city) — omit a key when not applicable. */
  blockers?: UniversalBlockers;
}): NextQuestionResult {
  const category = normalizeCategory(input.category);
  const facts = input.facts ?? {};
  if (!category) return null;

  const requiredFields = requiredFieldsFor(category);
  const coreImportantFields = CORE_IMPORTANT_FIELDS[category] ?? [];
  const priceApplicable = PRICE_BEARING_CATEGORIES.has(category);
  const uncertainFields = UNCERTAIN_TIER_FIELDS[category] ?? [];
  const importantFields = IMPORTANT_FIELDS[category] ?? [];

  const blockerFields: string[] = [];
  const blockerFacts: NextQuestionFacts = {};
  if (input.blockers?.sellerType !== undefined) {
    blockerFields.push("sellerType");
    blockerFacts.sellerType = input.blockers.sellerType;
  }
  if (input.blockers?.city !== undefined) {
    blockerFields.push("city");
    blockerFacts.city = input.blockers.city;
  }
  const allFacts: NextQuestionFacts = { ...facts, ...blockerFacts };

  const orderedFields: string[] = [
    ...uncertainFields,
    ...requiredFields,
    ...coreImportantFields,
    ...blockerFields,
    ...(priceApplicable ? ["price"] : []),
    ...importantFields,
  ];

  // Tier 0 — conflict outranks every ordinary missing/enrichment fact.
  for (const field of orderedFields) {
    if (allFacts[field]?.conflict) {
      return { field, reason: "conflict", question: questionFor(field, "conflict") };
    }
  }

  // Tier 1 — trust/safety-critical uncertain facts (never treated as final while unresolved).
  for (const field of uncertainFields) {
    if (isUncertain(allFacts[field])) {
      return { field, reason: "uncertain", question: questionFor(field, "uncertain") };
    }
  }

  // Tier 2 — Stage 13A required attributes (or clothing's local required tier).
  for (const field of requiredFields) {
    if (isMissing(allFacts[field])) {
      return { field, reason: "missing_required", question: questionFor(field, "missing_required") };
    }
  }

  // Tier 3 — Phase 2B core-important identity fields (e.g. vehicle model).
  for (const field of coreImportantFields) {
    if (isMissing(allFacts[field])) {
      return { field, reason: "missing_important", question: questionFor(field, "missing_important") };
    }
  }

  // Tier 4 — universal publish blockers (sellerType before city). Never re-derives
  // auth/phone/photo readiness — the caller's `blockers` input is authoritative here.
  for (const field of blockerFields) {
    if (isMissing(allFacts[field])) {
      return { field, reason: "missing_blocker", question: questionFor(field, "missing_blocker") };
    }
  }

  // Tier 5 — universal price.
  if (priceApplicable && isMissing(allFacts.price)) {
    return { field: "price", reason: "missing_required", question: questionFor("price", "missing_required") };
  }

  // Tier 6 — category-specific buyer-decision-value enrichment (high-value → low-value).
  for (const field of importantFields) {
    if (isMissing(allFacts[field])) {
      return { field, reason: "missing_important", question: questionFor(field, "missing_important") };
    }
  }

  return null;
}

/** Legacy raw category tokens seen in older drafts, resolved defensively before the fail-closed check. */
const CATEGORY_LEGACY_ALIASES: Record<string, NextQuestionCategory> = {
  automobiliai: "vehicles",
  auto: "vehicles",
  nt: "real_estate",
  nekilnojamas: "real_estate",
  elektronika: "electronics",
  apranga: "clothing",
  mada: "clothing",
  paslaugos: "services",
  darbas: "jobs",
};

export function normalizeCategory(
  raw: string | null | undefined
): NextQuestionCategory | null {
  const v = String(raw ?? "").trim().toLowerCase();
  const known: readonly NextQuestionCategory[] = [
    "vehicles",
    "transport",
    "real_estate",
    "electronics",
    "clothing",
    "services",
    "jobs",
    "home",
    "tools",
    "rental",
    "other",
  ];
  if ((known as readonly string[]).includes(v)) return v as NextQuestionCategory;
  return CATEGORY_LEGACY_ALIASES[v] ?? null;
}

/** Legacy attribute key aliases still written by older live-chat extractors. */
const FIELD_ALIASES: Record<string, readonly string[]> = {
  techInspection: ["ta", "inspectionValidUntil", "taValidUntil"],
};

function readAttr(
  attributes: Record<string, string | string[] | undefined>,
  key: string
): string {
  for (const alias of [key, ...(FIELD_ALIASES[key] ?? [])]) {
    const raw = attributes[alias];
    if (raw == null) continue;
    const s = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw);
    if (s.trim()) return s.trim();
  }
  return "";
}

/**
 * Adapt the live chat draft's flat `attributes` map (Record<string,string>) into the
 * policy's `NextQuestionFacts` shape — the single conversion point both live call
 * sites (`buildSellerContextualVoiceFollowUp`, `collectDraftFollowUpGaps`) use.
 *
 * Conventions (additive, opt-in — absent markers default to "known/confident"):
 *   - `${key}Conflict === "true"`   ⇒ material conflict on that field.
 *   - `${key}Uncertain === "true"`  ⇒ low-confidence / unresolved (e.g. VIN pending confirmation).
 */
export function factsFromAttributes(
  category: string | null | undefined,
  attributes: Record<string, string | string[] | undefined> = {},
  opts?: { price?: number | null }
): NextQuestionFacts {
  const normalized = normalizeCategory(category);
  if (!normalized) return {};

  const fields = new Set<string>([
    ...requiredFieldsFor(normalized),
    ...(CORE_IMPORTANT_FIELDS[normalized] ?? []),
    ...(UNCERTAIN_TIER_FIELDS[normalized] ?? []),
    ...(IMPORTANT_FIELDS[normalized] ?? []),
  ]);

  const facts: NextQuestionFacts = {};
  for (const key of fields) {
    const value = readAttr(attributes, key);
    const conflict = String(attributes[`${key}Conflict`] ?? "") === "true";
    const uncertain = String(attributes[`${key}Uncertain`] ?? "") === "true";
    facts[key] = {
      value: value || undefined,
      confidence: uncertain ? 0.3 : 1,
      conflict,
    };
  }

  if (PRICE_BEARING_CATEGORIES.has(normalized)) {
    const price = opts?.price;
    facts.price = { value: price != null && price > 0 ? price : undefined };
  }

  return facts;
}

/**
 * Normalize the two universal publish blockers (`sellerType`, `city`) into the
 * small `FactState` signal `selectNextQuestion` expects — without re-implementing
 * `pre-publish-validation.ts`'s authoritative auth/phone/photo checks. Mirrors the
 * exact placeholder rule already used at the `postNewListing` live call site
 * (empty or the literal "miestas" placeholder ⇒ missing).
 */
export function deriveUniversalBlockers(input: {
  location?: string | null;
  sellerType?: string | null;
}): UniversalBlockers {
  const city = String(input.location ?? "").trim();
  const hasCity = Boolean(city) && city.toLowerCase() !== "miestas";
  const sellerType = String(input.sellerType ?? "").trim();
  return {
    sellerType: { value: sellerType || undefined },
    city: { value: hasCity ? city : undefined },
  };
}

/**
 * Exposed for tests — the exact deterministic field-priority order per category,
 * given an optional universal-blockers shape (defaults to both blockers applicable,
 * matching the two live call sites which always pass sellerType + city).
 */
export function debugPriorityOrder(
  category: string,
  opts?: { includeBlockers?: boolean }
): string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const requiredFields = requiredFieldsFor(normalized);
  const coreImportantFields = CORE_IMPORTANT_FIELDS[normalized] ?? [];
  const priceApplicable = PRICE_BEARING_CATEGORIES.has(normalized);
  const uncertainFields = UNCERTAIN_TIER_FIELDS[normalized] ?? [];
  const importantFields = IMPORTANT_FIELDS[normalized] ?? [];
  const includeBlockers = opts?.includeBlockers ?? true;
  return [
    ...uncertainFields,
    ...requiredFields,
    ...coreImportantFields,
    ...(includeBlockers ? ["sellerType", "city"] : []),
    ...(priceApplicable ? ["price"] : []),
    ...importantFields,
  ];
}

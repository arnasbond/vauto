/**
 * Finding C — explicit enrichment attribute ownership boundary.
 *
 * The marketplace-domain vertical schema (attributes.ts) is the canonical
 * field set. Anything a model emits OUTSIDE that schema must be explicitly
 * owned by a named enrichment namespace with a provenance tag — otherwise it
 * is an arbitrary unknown key and is dropped during normalization.
 *
 * This replaces the previous "preserve every non-canonical key" behavior so
 * the architecture is:
 *
 *   CANONICAL ATTRIBUTES  +  EXPLICITLY OWNED / PROVENANCED ENRICHMENT
 *
 * and never:
 *
 *   CANONICAL ATTRIBUTES  +  ARBITRARY UNKNOWN KEYS
 *
 * Transport is NOT special-cased: it simply owns one enrichment namespace
 * ("vehicle-ocr") that the model is explicitly instructed to fill from
 * Regitra/tech-passport OCR. Any other vertical can declare its own namespace
 * here later without adding a per-vertical engine — the mechanism is generic.
 */
import type { VerticalId } from "../shared/marketplace-domain/types.js";
import { getVertical } from "../shared/marketplace-domain/registry.js";

export type EnrichmentProvenance = "OCR" | "CATALOG" | "USER_CLAIM";

export type EnrichmentNamespace = {
  /** Stable id, used in provenance/logging. */
  id: string;
  /** Owning subsystem (deterministic enrichment layer, not the model). */
  owner: string;
  provenance: EnrichmentProvenance;
  /** Non-canonical attribute keys owned by this namespace. */
  keys: readonly string[];
};

/**
 * Universal packaging/OCR facts the deep-OCR rule instructs the model to emit
 * for any physical good (electronics, home/garden, clothing, transport, other).
 * These are generic product facts, not vertical-specific schemas.
 */
const UNIVERSAL_PHYSICAL_GOOD_OCR: EnrichmentNamespace = {
  id: "packaging-ocr",
  owner: "vision-deep-ocr",
  provenance: "OCR",
  keys: [
    "brand",
    "model",
    "condition",
    "specs",
    "contents",
    "color",
    "size",
  ] as const,
};

/**
 * Transport vehicle identity fields the model is explicitly instructed to emit
 * from Regitra/tech-passport OCR (P.1/P.2/P.3/S.1/B/R/A/E) plus the fields the
 * server-owned vehicle enrichment (enrichVehicleVisionDraft + catalog soft-fill)
 * writes post-normalization. Keeping the latter here too is defensive: they are
 * trusted server outputs, so they must never be treated as arbitrary model keys.
 */
const VEHICLE_OCR_ENRICHMENT: EnrichmentNamespace = {
  id: "vehicle-ocr",
  owner: "vehicle-vision-enrich",
  provenance: "OCR",
  keys: [
    "engine",
    "engineCc",
    "engineCapacity",
    "variklis",
    "powerKw",
    "power",
    "galia",
    "kw",
    "bodyType",
    "kebulas",
    "doors",
    "driveType",
    "gearbox",
    "pavaros",
    "seats",
    "seatCount",
    "vietos",
    "color",
    "firstRegistration",
    "registrationDate",
    "regDate",
    "firstRegDate",
    "plate",
    "licensePlate",
    "vinKodas",
    "interiorCondition",
    "interior",
    "salon",
    "upholstery",
    "exteriorFeatures",
    "exterior",
    "features",
    "equipment",
    "fuel",
    "kuras",
    "mileageKm",
    "rida",
    "techInspection",
    "ta",
    "taValidUntil",
    "inspectionValidUntil",
    "euroStandard",
    "curbWeight",
    "specSource",
    "specConfidence",
    "catalogModificationId",
    "catalogModificationLabel",
    "catalogNote",
    "catalogAlternatives",
  ] as const,
};

/**
 * Cross-cutting extraction metadata that may legitimately ride along inside the
 * technicalFields object on some code paths (the draft reader falls back to
 * technicalFields.X for these). Kept for all verticals so normalization never
 * drops a structural field it does not own. They are metadata, not listing facts.
 */
const UNIVERSAL_STRUCTURAL_KEYS = [
  "sceneContext",
  "photoStyle",
  "estimatedSize",
  "fitsOmnivaLocker",
  "choiceChips",
  "clarificationPrompt",
  "selectedObject",
] as const;

const VERTICAL_ENRICHMENT_NAMESPACES: Record<
  VerticalId,
  readonly EnrichmentNamespace[]
> = {
  TRANSPORT: [UNIVERSAL_PHYSICAL_GOOD_OCR, VEHICLE_OCR_ENRICHMENT],
  ELECTRONICS: [UNIVERSAL_PHYSICAL_GOOD_OCR],
  HOME_GARDEN: [UNIVERSAL_PHYSICAL_GOOD_OCR],
  CLOTHING: [UNIVERSAL_PHYSICAL_GOOD_OCR],
  OTHER: [UNIVERSAL_PHYSICAL_GOOD_OCR],
  REAL_ESTATE: [],
  SERVICES: [],
  JOBS: [],
};

/** Canonical keys + explicitly-owned enrichment keys for a vertical. */
export function allowedAttributeKeys(verticalId: VerticalId): Set<string> {
  const allowed = new Set<string>(UNIVERSAL_STRUCTURAL_KEYS);
  const vertical = getVertical(verticalId);
  for (const def of vertical.attributes) allowed.add(def.key);
  for (const ns of VERTICAL_ENRICHMENT_NAMESPACES[verticalId] ?? []) {
    for (const key of ns.keys) allowed.add(key);
  }
  return allowed;
}

/** Enrichment namespaces a vertical owns (canonical schema keys excluded). */
export function enrichmentNamespacesFor(
  verticalId: VerticalId
): readonly EnrichmentNamespace[] {
  return VERTICAL_ENRICHMENT_NAMESPACES[verticalId] ?? [];
}

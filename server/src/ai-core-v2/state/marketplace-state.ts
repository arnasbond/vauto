/**
 * VAUTO AI Core v2 — authoritative structured marketplace state.
 *
 * This is the SINGLE canonical interpretation contract for the v2 reasoning
 * loop. It is deliberately small and provenance-aware: it distinguishes what
 * the user stated, what the model inferred, and what a tool/vision/document
 * derived, so a fact can never silently masquerade as a different source.
 *
 * This module is PURE (types + factories). It has NO dependency on the
 * legacy orchestrator, planner, fast-paths, or prompts.
 */

export const CORE_V2_STATE_VERSION = "2.1" as const;

/** Where a fact came from. Deterministic provenance, never implied. */
export type ProvenanceSource =
  | "USER_STATED"
  | "MODEL_INFERRED"
  | "TOOL_DERIVED"
  | "VISION_DERIVED"
  | "DOCUMENT_DERIVED";

export interface Provenance {
  source: ProvenanceSource;
  /** Optional model confidence 0..1. Never treated as user intent. */
  confidence?: number;
  /** ISO timestamp when the fact was recorded. */
  at: string;
}

/**
 * The canonical, execution-eligible hard-constraint keys for THIS v2 stage.
 *
 * These are the ONLY keys that the reasoning model may emit in a `setHard`
 * patch, and the ONLY keys that `deriveSearchListingsArgs` maps into a
 * `searchListings` execution. Anything else (e.g. "", "city", "bodyType",
 * "propertyType") is a schema/state-contract rejection at parse time, never
 * silently stored. This is a contract, not an intent cage.
 */
export const CANONICAL_HARD_CONSTRAINT_KEYS = [
  "category",
  "location",
  "priceMin",
  "priceMax",
] as const;

export type CanonicalHardConstraintKey =
  (typeof CANONICAL_HARD_CONSTRAINT_KEYS)[number];

/** Hard marketplace constraints — representable as concrete DB filters. */
export interface HardConstraints {
  category?: string;
  location?: string;
  priceMin?: number;
  priceMax?: number;
}

/** Soft preferences — reasoning/ranking context ONLY, never a hard filter. */
export interface SoftPreference {
  label: string;
  provenance: Provenance;
}

/**
 * A grounded negative/exclusion preference, e.g. "nenoriu SUV", "tik ne
 * dyzelinio", "ne Kaune". NEVER mapped to a positive hard filter — the
 * current search capability has no exclusion filter. Reasoning may use it to
 * evaluate results; it is not execution authority.
 */
export interface Exclusion {
  label: string;
  provenance: Provenance;
}

/** An explicit, consequential pending action awaiting user confirmation. */
export interface PendingAction {
  type: string;
  description: string;
}

export interface MarketplaceState {
  version: typeof CORE_V2_STATE_VERSION;
  /** Free-form conversation goal, e.g. "nuspręsti butas/namas/kotedžas". */
  goal?: string;
  /** Canonical vertical/category hint (vehicles, real_estate, …). */
  vertical?: string;
  /**
   * Free-text SEARCH SUBJECT (e.g. "Toyota Corolla"). This is the ONLY free
   * text that may influence retrieval, and ONLY when provenance is USER_STATED.
   */
  searchSubject?: string;
  searchSubjectProvenance?: Provenance;
  hardConstraints: HardConstraints;
  hardConstraintProvenance: Partial<Record<keyof HardConstraints, Provenance>>;
  softPreferences: SoftPreference[];
  /** Grounded negative/exclusion preferences (non-executable). */
  exclusions: Exclusion[];
  /** Questions still open between the user and the assistant. */
  unresolved: string[];
  /** User-selected / grounded listing referents. */
  selectedListingIds: string[];
  /** Consequential action awaiting explicit confirmation. */
  pendingAction?: PendingAction;
}

export function emptyMarketplaceState(): MarketplaceState {
  return {
    version: CORE_V2_STATE_VERSION,
    hardConstraints: {},
    hardConstraintProvenance: {},
    softPreferences: [],
    exclusions: [],
    unresolved: [],
    selectedListingIds: [],
  };
}

export function provenance(
  source: ProvenanceSource,
  confidence?: number,
  at?: string
): Provenance {
  return { source, ...(confidence != null ? { confidence } : {}), at: at ?? new Date().toISOString() };
}

/**
 * Constraint authority: distinguishes FACTUAL authority from USER-INTENT
 * authority. Only USER_STATED values are user intent; grounded facts
 * (tool/vision/document) and model inferences are NOT user intent and must
 * not silently narrow a marketplace tool query as an authoritative filter.
 */
export type ConstraintAuthority = "USER_INTENT" | "GROUNDED_FACT" | "MODEL_INFERENCE";

export function constraintAuthority(p: Provenance | undefined): ConstraintAuthority {
  switch (p?.source) {
    case "USER_STATED":
      return "USER_INTENT";
    case "MODEL_INFERRED":
      return "MODEL_INFERENCE";
    case "TOOL_DERIVED":
    case "VISION_DERIVED":
    case "DOCUMENT_DERIVED":
      return "GROUNDED_FACT";
    default:
      return "MODEL_INFERENCE";
  }
}

/**
 * A hard constraint is execution-eligible (may narrow a tool query as a
 * hard filter) ONLY when it is explicitly USER_STATED. Model inferences and
 * grounded facts may enrich interpreted state but never become hard filters.
 */
export function isExecutionEligible(p: Provenance | undefined): boolean {
  return constraintAuthority(p) === "USER_INTENT";
}

/** Extract only the execution-eligible (USER_STATED) hard constraints. */
export function executionEligibleHardConstraints(
  state: MarketplaceState
): HardConstraints {
  const out: HardConstraints = {};
  const c = state.hardConstraints;
  const p = state.hardConstraintProvenance;
  if (c.category != null && isExecutionEligible(p.category)) out.category = c.category;
  if (c.location != null && isExecutionEligible(p.location)) out.location = c.location;
  if (c.priceMin != null && isExecutionEligible(p.priceMin)) out.priceMin = c.priceMin;
  if (c.priceMax != null && isExecutionEligible(p.priceMax)) out.priceMax = c.priceMax;
  return out;
}

/**
 * The free-text search subject is execution-eligible ONLY when USER_STATED.
 * A MODEL_INFERRED subject (e.g. the model guessing "Toyota SUV") must never
 * narrow retrieval.
 */
export function executionEligibleSearchSubject(
  state: MarketplaceState
): string | undefined {
  if (state.searchSubject && isExecutionEligible(state.searchSubjectProvenance)) {
    return state.searchSubject;
  }
  return undefined;
}

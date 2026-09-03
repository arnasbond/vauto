/**
 * F9 — canonical fact-conflict state for price / city / condition.
 *
 * ONE deterministic conflict mechanism, consistent with the certified
 * Phase 2D year-conflict and F5 rooms/workType reducers:
 *
 *   marker convention: `${field}Conflict` = "true" ("" tombstone on
 *   resolution) + `${field}ConflictCandidate` = candidate value.
 *
 * Lifecycle (deterministic):
 *   - first trusted fact becomes canonical;
 *   - semantically equal values never conflict (numeric price compare,
 *     folded city compare, canonical condition enum);
 *   - A (canonical) vs B (candidate) keeps A canonical and B as candidate;
 *   - an unrelated turn (no incoming) never touches an open conflict;
 *   - an explicit A or B choice resolves the conflict and tombstones the
 *     markers;
 *   - a third C value never silently resolves — canonical + original
 *     candidate stay;
 *   - malformed markers (non-"true" flag, invalid/missing canonical or
 *     candidate) confer NO authority and are ignored fail-closed.
 *
 * No delimiter serialization exists: the question is built from TYPED
 * structured values.
 */

export const FACT_CONFLICT_FIELDS = ["price", "city", "condition"] as const;
export type FactConflictField = (typeof FACT_CONFLICT_FIELDS)[number];

export const FACT_CONFLICT_MARKER_KEYS = [
  "priceConflict",
  "priceConflictCandidate",
  "cityConflict",
  "cityConflictCandidate",
  "conditionConflict",
  "conditionConflictCandidate",
] as const;

export function conflictKeysForField(
  field: FactConflictField
): readonly [string, string] {
  return [`${field}Conflict`, `${field}ConflictCandidate`] as const;
}

export const FACT_PRICE_MAX = 100_000_000;

/** Price: only a finite number in the allowed range; numeric comparison. */
export function normalizePriceValue(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0 || raw > FACT_PRICE_MAX) return undefined;
    return raw;
  }
  if (typeof raw === "string") {
    const s = raw.trim().replace(/\s/g, "");
    if (!/^\d{1,9}([.,]\d{1,2})?$/.test(s)) return undefined;
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > FACT_PRICE_MAX) return undefined;
    return n;
  }
  return undefined;
}

export const FACT_CITY_MAX = 120;

/** City: trimmed, capped display value; equality is folded (case/whitespace). */
export function normalizeCityValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (s.length < 1 || s.length > FACT_CITY_MAX) return undefined;
  return s;
}

export function cityValuesEqual(a: unknown, b: unknown): boolean {
  const na = normalizeCityValue(a);
  const nb = normalizeCityValue(b);
  if (na === undefined || nb === undefined) return false;
  return foldCity(na) === foldCity(nb);
}

function foldCity(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ");
}

const CONDITION_SYNONYMS: ReadonlyArray<{ re: RegExp; canonical: string }> = [
  { re: /\b(beveik\s*nauj|like\s*new|kaip\s*nauj)/i, canonical: "Beveik nauja" },
  { re: /\b(nauj\w*|new)\b/i, canonical: "Nauja" },
  { re: /\b(naudot\w*|used)\b/i, canonical: "Naudota" },
];

/** Condition: canonical enum via allowed Lithuanian/English synonyms. */
export function normalizeConditionValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (s.length < 1 || s.length > 80) return undefined;
  for (const { re, canonical } of CONDITION_SYNONYMS) {
    if (re.test(s)) return canonical;
  }
  return undefined;
}

/**
 * Extract a condition from free user text (sentences may be long; only the
 * matched fragment matters). Returns the canonical value of the FIRST
 * synonym found, else undefined.
 */
export function extractConditionFromText(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const t = text.trim();
  if (!t) return undefined;
  for (const { re, canonical } of CONDITION_SYNONYMS) {
    const m = t.match(re);
    if (m?.[0]) return canonical;
  }
  return undefined;
}

function normalizeFieldValue(
  field: FactConflictField,
  raw: unknown
): number | string | undefined {
  if (field === "price") return normalizePriceValue(raw);
  if (field === "city") return normalizeCityValue(raw);
  return normalizeConditionValue(raw);
}

function fieldValuesEqual(
  field: FactConflictField,
  a: number | string | undefined,
  b: number | string | undefined
): boolean {
  if (a === undefined || b === undefined) return false;
  if (field === "price") return Number(a) === Number(b);
  if (field === "city") return foldCity(String(a)) === foldCity(String(b));
  return String(a) === String(b);
}

export interface ActiveFactConflict {
  field: FactConflictField;
  canonical: string | number;
  candidate: string | number;
}

/**
 * Read the active conflict for ONE specific field (or null). Malformed
 * markers (non-"true" flag, invalid canonical/candidate) are ignored
 * fail-closed.
 */
export function readActiveFactConflictForField(
  field: FactConflictField,
  merged: Record<string, unknown>
): ActiveFactConflict | null {
  const [conflictKey, candidateKey] = conflictKeysForField(field);
  if (String(merged[conflictKey] ?? "") !== "true") return null;
  const canonical = normalizeFieldValue(field, merged[field]);
  const candidate = normalizeFieldValue(field, merged[candidateKey]);
  if (canonical === undefined || candidate === undefined) return null;
  return { field, canonical, candidate };
}

/**
 * Read the FIRST active conflict from a merged fact view
 * `{ price, city, condition, ...attributes }`.
 */
export function readActiveFactConflict(
  merged: Record<string, unknown>
): ActiveFactConflict | null {
  for (const field of FACT_CONFLICT_FIELDS) {
    const conflict = readActiveFactConflictForField(field, merged);
    if (conflict) return conflict;
  }
  return null;
}

const FACT_CONFLICT_LABELS: Record<FactConflictField, string> = {
  price: "kainą",
  city: "miestą",
  condition: "būklę",
};

/** ONE clear typed question for an open conflict — never delimiter parsing. */
export function buildFactConflictQuestion(conflict: ActiveFactConflict): string {
  const label = FACT_CONFLICT_LABELS[conflict.field];
  const canonical = String(conflict.canonical);
  const candidate = String(conflict.candidate);
  return `Pastebėjau prieštaravimą: nurodėte ${label} „${candidate}“, bet juodraštyje jau yra „${canonical}“. Kuris variantas teisingas?`;
}

export interface FactConflictPatch {
  patch: Record<string, string | number>;
}

/**
 * One deterministic conflict-state transition (mirrors the year/rooms/
 * workType reducers). `priorAttributes` is the merged fact view.
 */
export function resolveFactConflictState(input: {
  field: FactConflictField;
  priorAttributes?: Record<string, unknown>;
  incomingValue?: unknown;
}): FactConflictPatch {
  const priorAttrs = input.priorAttributes ?? {};
  const [conflictKey, candidateKey] = conflictKeysForField(input.field);
  const priorCanonical = normalizeFieldValue(input.field, priorAttrs[input.field]);
  const priorCandidate = normalizeFieldValue(input.field, priorAttrs[candidateKey]);
  const priorConflictActive =
    String(priorAttrs[conflictKey] ?? "") === "true" &&
    priorCanonical !== undefined &&
    priorCandidate !== undefined;
  const incoming = normalizeFieldValue(input.field, input.incomingValue);

  if (priorConflictActive) {
    if (incoming === undefined) return { patch: {} };
    // Resolution keeps the STORED display value (a folded answer like
    // "vilnius" resolves to the candidate's display "Vilnius").
    if (fieldValuesEqual(input.field, incoming, priorCanonical)) {
      return {
        patch: {
          [input.field]: priorCanonical,
          [conflictKey]: "",
          [candidateKey]: "",
        },
      };
    }
    if (fieldValuesEqual(input.field, incoming, priorCandidate)) {
      return {
        patch: {
          [input.field]: priorCandidate,
          [conflictKey]: "",
          [candidateKey]: "",
        },
      };
    }
    return {
      patch: {
        [input.field]: priorCanonical,
        [conflictKey]: "true",
        [candidateKey]: priorCandidate,
      },
    };
  }

  if (incoming === undefined) return { patch: {} };
  if (priorCanonical === undefined) {
    return { patch: { [input.field]: incoming } };
  }
  if (!fieldValuesEqual(input.field, priorCanonical, incoming)) {
    return {
      patch: {
        [input.field]: priorCanonical,
        [conflictKey]: "true",
        [candidateKey]: incoming,
      },
    };
  }
  return { patch: {} };
}

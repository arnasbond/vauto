/**
 * F5 closure — live vertical field-conflict state (rooms / workType).
 *
 * ONE small, deterministic, category-neutral conflict-state reducer used for
 * BOTH `rooms` (REAL_ESTATE) and `workType` (JOBS) through the real live
 * `runVautoAgent` draft-update path. Marker convention mirrors the certified
 * Phase 2B year-conflict convention: `${field}Conflict` ("" tombstone on
 * resolution) and `${field}ConflictCandidate`.
 *
 * Whitelist only — dynamic/unchecked field names are impossible by typing; a
 * category that does not own the field can never create its markers.
 *
 * Fail-closed guarantees:
 *   - canonical/candidate/incoming values are NORMALIZED before any semantic
 *     comparison (case, whitespace, supported inflections);
 *   - malformed markers (missing/empty candidate, non-"true" flags) never
 *     manufacture a resolution — they are ignored safely;
 *   - ambiguous multi-variant turns ("2 arba 3 kambariai", "biure arba
 *     nuotoliu") never pick silently: state is kept and, when a canonical
 *     exists, an explicit clarification conflict is opened with the first
 *     differing variant as the candidate;
 *   - "kaina 12 k." (tūkst.) is never interpreted as rooms.
 */

export const VERTICAL_CONFLICT_FIELDS = {
  rooms: "real_estate",
  workType: "jobs",
} as const;

export type VerticalConflictField = keyof typeof VERTICAL_CONFLICT_FIELDS;

/** Rooms: only an explicit bounded positive integer (1..30). */
export function normalizeRoomsValue(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,2}$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0 || n > 30) return undefined;
  return String(n);
}

/** WorkType: only the three canonical variants, case/whitespace/inflection tolerant. */
export function normalizeWorkTypeValue(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim().toLowerCase();
  if (/\b(biur\w*|ofis\w*|on[\s-]?site)\b/.test(s)) return "Biure";
  if (/\b(nuotoli\w*|remote|distancin\w*)\b/.test(s)) return "Nuotoliu";
  if (/\b(hibrid\w*|hybrid|mi[sš]r\w*)\b/.test(s)) return "Hibridas";
  return undefined;
}

function normalizeFieldValue(
  field: VerticalConflictField,
  raw: unknown
): string | undefined {
  return field === "rooms" ? normalizeRoomsValue(raw) : normalizeWorkTypeValue(raw);
}

/**
 * One deterministic conflict-state transition. All prior/incoming values are
 * normalized before comparison; the resolved canonical is always stored in its
 * normalized form.
 */
export function resolveVerticalConflictPatch(input: {
  field: VerticalConflictField;
  category: string | null | undefined;
  priorAttributes?: Record<string, string | undefined>;
  incomingValue?: string | null;
}): Record<string, string> {
  const allowedCategory = VERTICAL_CONFLICT_FIELDS[input.field];
  const category = String(input.category ?? "").trim().toLowerCase();
  if (category !== allowedCategory) return {};

  const priorAttrs = input.priorAttributes ?? {};
  const conflictKey = `${input.field}Conflict`;
  const candidateKey = `${input.field}ConflictCandidate`;
  const priorCanonical = normalizeFieldValue(input.field, priorAttrs[input.field]);
  const priorCandidate = normalizeFieldValue(input.field, priorAttrs[candidateKey]);
  const priorConflictActive =
    String(priorAttrs[conflictKey] ?? "") === "true" &&
    Boolean(priorCanonical) &&
    Boolean(priorCandidate);
  const incoming = normalizeFieldValue(input.field, input.incomingValue);

  if (priorConflictActive) {
    if (!incoming) return {};
    if (incoming === priorCanonical || incoming === priorCandidate) {
      return { [input.field]: incoming, [conflictKey]: "", [candidateKey]: "" };
    }
    return {
      [input.field]: priorCanonical!,
      [conflictKey]: "true",
      [candidateKey]: priorCandidate!,
    };
  }

  if (!incoming) return {};
  if (!priorCanonical) return { [input.field]: incoming };
  if (priorCanonical !== incoming) {
    return {
      [input.field]: priorCanonical,
      [conflictKey]: "true",
      [candidateKey]: incoming,
    };
  }
  return {};
}

/**
 * Variant-aware entrypoint for a live turn:
 *   - 0 variants        → no change;
 *   - 1 variant         → normal conflict-state transition;
 *   - >1 distinct       → NEVER pick silently:
 *       * pending valid conflict → preserved (existing machinery asks it);
 *       * valid canonical + differing variant → explicit clarification
 *         conflict with the first differing variant as the candidate;
 *       * NO valid canonical (empty draft or malformed prior markers) →
 *         no value is written; `needsClarification` signals the caller to
 *         surface exactly one deterministic clarification question.
 * Malformed active markers (missing/invalid canonical or candidate) never
 * block a fresh clarification.
 */
export type AmbiguousVerticalPatchResult = {
  patch: Record<string, string>;
  needsClarification: boolean;
};

export function resolveAmbiguousVerticalPatch(input: {
  field: VerticalConflictField;
  category: string | null | undefined;
  priorAttributes?: Record<string, string | undefined>;
  variants: string[];
}): AmbiguousVerticalPatchResult {
  const allowedCategory = VERTICAL_CONFLICT_FIELDS[input.field];
  const category = String(input.category ?? "").trim().toLowerCase();
  if (category !== allowedCategory) return { patch: {}, needsClarification: false };

  const unique = [
    ...new Set(
      input.variants
        .map((v) => normalizeFieldValue(input.field, v))
        .filter((v): v is string => Boolean(v))
    ),
  ];
  if (unique.length === 0) return { patch: {}, needsClarification: false };
  if (unique.length === 1) {
    return {
      patch: resolveVerticalConflictPatch({
        field: input.field,
        category: input.category,
        priorAttributes: input.priorAttributes,
        incomingValue: unique[0],
      }),
      needsClarification: false,
    };
  }

  const priorAttrs = input.priorAttributes ?? {};
  const conflictKey = `${input.field}Conflict`;
  const candidateKey = `${input.field}ConflictCandidate`;
  const canonical = normalizeFieldValue(input.field, priorAttrs[input.field]);
  const candidate = normalizeFieldValue(input.field, priorAttrs[candidateKey]);
  const priorConflictActive =
    String(priorAttrs[conflictKey] ?? "") === "true" &&
    Boolean(canonical) &&
    Boolean(candidate);

  if (priorConflictActive) return { patch: {}, needsClarification: false };

  if (canonical) {
    const differing = unique.find((v) => v !== canonical);
    if (!differing) return { patch: {}, needsClarification: false };
    return {
      patch: {
        [input.field]: canonical,
        [conflictKey]: "true",
        [candidateKey]: differing,
      },
      needsClarification: false,
    };
  }

  // No valid canonical (empty draft or malformed prior markers): never pick a
  // variant silently — ask exactly one deterministic clarification.
  return { patch: {}, needsClarification: true };
}

/**
 * Deterministic rooms extraction — only explicit bounded positive integer
 * LT forms with the `kamb` stem ("2 kambariai", "3 kambarių", "kamb."). The
 * bare "k." abbreviation is deliberately NOT accepted ("kaina 12 k." is
 * tūkst., not rooms); areas, years and prices never match.
 */
export function extractRoomsVariants(text: string): string[] {
  const t = String(text ?? "");
  // Ambiguous pair ("2 arba 3 kambariai") — NEVER pick silently: both
  // variants are returned so the resolver opens an explicit clarification.
  const pair = t.match(
    /\b(\d{1,2})\s*(?:arba|ar\s|,|[/–-])\s*(\d{1,2})\s*(?=kamb\w*)/i
  );
  if (pair) {
    const a = normalizeRoomsValue(pair[1]);
    const b = normalizeRoomsValue(pair[2]);
    if (a && b && a !== b) return [a, b];
  }
  const matches = t.matchAll(/\b(\d{1,2})\s*kamb\w*\b/gi);
  const values = new Set<string>();
  for (const m of matches) {
    const n = normalizeRoomsValue(m[1]);
    if (n) values.add(n);
  }
  return [...values];
}

/** Single-value helper: exactly one distinct room count, else undefined. */
export function extractRoomsFromChat(text: string): string | undefined {
  const variants = extractRoomsVariants(text);
  return variants.length === 1 ? variants[0] : undefined;
}

/**
 * Deterministic workType extraction — only the three canonical variants with
 * reasonable LT/EN inflections. The bare word "darbas" is never a workType.
 */
export function extractWorkTypeVariants(text: string): string[] {
  const t = String(text ?? "").toLowerCase();
  const found = new Set<string>();
  if (/\b(biur\w*|ofis\w*|on[\s-]?site)\b/.test(t)) found.add("Biure");
  if (/\b(nuotoli\w*|remote|distancin\w*)\b/.test(t)) found.add("Nuotoliu");
  if (/\b(hibrid\w*|hybrid|mi[sš]r\w*)\b/.test(t)) found.add("Hibridas");
  return [...found];
}

/** Single-value helper: exactly one distinct variant, else undefined. */
export function extractWorkTypeFromChat(text: string): string | undefined {
  const variants = extractWorkTypeVariants(text);
  return variants.length === 1 ? variants[0] : undefined;
}

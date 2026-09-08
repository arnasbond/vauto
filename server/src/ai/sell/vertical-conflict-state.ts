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
  area: "real_estate",
  yearBuilt: "real_estate",
  storage: "electronics",
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

/** Area (m²): only a positive number in a sane range; canonical decimal string. */
export function normalizeAreaValue(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return undefined;
  return String(n);
}

/** Year built: only a plausible construction year (1800..2100). */
export function normalizeYearBuiltValue(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1800 || n > 2100) return undefined;
  return String(n);
}

const STORAGE_CANONICAL: ReadonlyArray<{ re: RegExp; canonical: string }> = [
  { re: /^64\s*(gb|g|gigab\w*)?$/, canonical: "64 GB" },
  { re: /^128\s*(gb|g|gigab\w*)?$/, canonical: "128 GB" },
  { re: /^256\s*(gb|g|gigab\w*)?$/, canonical: "256 GB" },
  { re: /^512\s*(gb|g|gigab\w*)?$/, canonical: "512 GB" },
  { re: /^1\s*(tb|t|terab\w*)?$/, canonical: "1 TB" },
];

/** Storage: only the canonical enum values (GB/TB), case/space tolerant. */
export function normalizeStorageValue(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  for (const { re, canonical } of STORAGE_CANONICAL) {
    if (re.test(s)) return canonical;
  }
  return undefined;
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
  switch (field) {
    case "rooms":
      return normalizeRoomsValue(raw);
    case "area":
      return normalizeAreaValue(raw);
    case "yearBuilt":
      return normalizeYearBuiltValue(raw);
    case "storage":
      return normalizeStorageValue(raw);
    case "workType":
      return normalizeWorkTypeValue(raw);
    default:
      return undefined;
  }
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

/**
 * Deterministic area extraction (m²) — explicit area context only: "62 kv",
 * "62 m²", "62 kv.m", "62 kvadratų", "plotas 62", "area 62". A bare "62"
 * without context is NEVER area (it could be rooms/price).
 */
export function extractAreaVariants(text: string): string[] {
  const t = String(text ?? "");
  const values = new Set<string>();
  const re =
    /\b(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:kv\.?\s*(?:m\.?|metr\w*)?|kvadrat\w*|m²|m2)(?=\W|$)/giu;
  for (const m of t.matchAll(re)) {
    const n = normalizeAreaValue(m[1]);
    if (n) values.add(n);
  }
  const keyword =
    /\b(?:plotas|area|kvadratūra|kvadratura)\s*(?:[=:—–-]?\s*)?(?:(?:apie|maždaug|apytiksliai)\s+)?(\d{1,4}(?:[.,]\d{1,2})?)/giu;
  for (const m of t.matchAll(keyword)) {
    const n = normalizeAreaValue(m[1]);
    if (n) values.add(n);
  }
  return [...values];
}

/** Single-value helper: exactly one distinct area, else undefined. */
export function extractAreaFromChat(text: string): string | undefined {
  const variants = extractAreaVariants(text);
  return variants.length === 1 ? variants[0] : undefined;
}

/**
 * Deterministic yearBuilt extraction — explicit construction-year context only:
 * "1998 m.", "1998 metų", "statybos 1998", "pastatytas 1998", "built 1998".
 * A bare "1998" without context is NEVER a build year (price/mileage/VIN risk).
 */
export function extractYearBuiltVariants(text: string): string[] {
  const t = String(text ?? "");
  const values = new Set<string>();
  // Construction-year evidence ONLY, in either order: "statybos 2021",
  // "pastatytas 2021", "2021 m. statybos". A bare "YYYY m." without a
  // construction keyword is deliberately NOT evidence (it could be a vehicle
  // year or any year); renovation/purchase years are not construction years.
  const kwBefore =
    /\b(?:statyb\w*|pastat\w*|built)\s*[^.!?\n]{0,16}?\b(19\d{2}|20[0-2]\d)\b/gi;
  for (const m of t.matchAll(kwBefore)) {
    const n = normalizeYearBuiltValue(m[1]);
    if (n) values.add(n);
  }
  const kwAfter =
    /\b(19\d{2}|20[0-2]\d)\s*(?:m\.|met\w*)\s*[^.!?\n]{0,16}?\b(?:statyb\w*|pastat\w*|built)\b/gi;
  for (const m of t.matchAll(kwAfter)) {
    const n = normalizeYearBuiltValue(m[1]);
    if (n) values.add(n);
  }
  return [...values];
}

/** Single-value helper: exactly one distinct build year, else undefined. */
export function extractYearBuiltFromChat(text: string): string | undefined {
  const variants = extractYearBuiltVariants(text);
  return variants.length === 1 ? variants[0] : undefined;
}

/**
 * Deterministic storage extraction (GB/TB) — explicit capacity context only:
 * "64 GB", "128 gb", "256 gigabaitų", "1 TB". A bare "256" without a unit is
 * NEVER storage (it could be a price/quantity).
 */
export function extractStorageVariants(text: string): string[] {
  const t = String(text ?? "");
  const values = new Set<string>();
  const re = /\b(?:64|128|256|512)\s*(?:gb|g|gigab\w*)\b|\b1\s*(?:tb|terab\w*)\b/gi;
  for (const m of t.matchAll(re)) {
    // Disambiguate RAM/memory from device storage: "256 GB RAM" is memory,
    // not a device-storage fact. Abstain when the surrounding text marks the
    // value as RAM/atmintis rather than device storage.
    const after = t.slice(
      (m.index ?? 0) + m[0].length,
      (m.index ?? 0) + m[0].length + 40
    );
    // RAM/memory is operational memory, NOT device storage. Lithuanian
    // "atmintis" alone is ambiguous but conventionally means device storage
    // (RAM is "operatyvioji atmintis") — so only explicit RAM markers abstain.
    if (/\b(?:ram|memory|operatyv\w*)\b/i.test(after)) {
      continue;
    }
    const n = normalizeStorageValue(m[0]);
    if (n) values.add(n);
  }
  return [...values];
}

/** Single-value helper: exactly one distinct storage, else undefined. */
export function extractStorageFromChat(text: string): string | undefined {
  const variants = extractStorageVariants(text);
  return variants.length === 1 ? variants[0] : undefined;
}

/**
 * Universal Fact Core — SEMANTIC conflict context (model-visible).
 *
 * "Give the model BETTER FACTS, not more behavioral prohibitions." The model
 * receives unresolved conflicts as plain, bounded semantic facts (field label +
 * current value + candidate value + unresolved status) — never the internal
 * `${field}Conflict`/`${field}ConflictCandidate` implementation keys, reducer
 * mechanics, or persistence flags. Provenance is NOT invented: it is reported
 * as unknown when unavailable.
 */
const CONFLICT_FIELD_LABELS: Record<string, string> = {
  year: "pagaminimo metai",
  price: "kaina",
  city: "miestas",
  condition: "būklė",
  rooms: "kambarių skaičius",
  area: "plotas",
  yearBuilt: "statybos metai",
  storage: "atmintis",
  workType: "darbo forma",
};

export interface SemanticConflict {
  field: string;
  label: string;
  canonical: string;
  candidate: string;
}

/** Read unresolved conflicts from a draft's attributes into semantic facts. */
export function readSemanticConflicts(
  attributes: Record<string, string | undefined> | null | undefined
): SemanticConflict[] {
  const attrs = attributes ?? {};
  const out: SemanticConflict[] = [];
  for (const field of Object.keys(CONFLICT_FIELD_LABELS)) {
    const conflictKey = `${field}Conflict`;
    const candidateKey = `${field}ConflictCandidate`;
    if (String(attrs[conflictKey] ?? "") !== "true") continue;
    const canonical = String(attrs[field] ?? "").trim();
    const candidate = String(attrs[candidateKey] ?? "").trim();
    if (!canonical || !candidate) continue;
    out.push({
      field,
      label: CONFLICT_FIELD_LABELS[field],
      canonical,
      candidate,
    });
  }
  return out.slice(0, 6);
}

/** Build the bounded model-visible semantic conflict block ("" when none). */
export function buildSemanticConflictContext(conflicts: SemanticConflict[]): string {
  if (!conflicts.length) return "";
  const lines = conflicts.map(
    (c) =>
      `- ${c.label}: dabartinė reikšmė „${c.canonical}", nauja kandidatė „${c.candidate}" (šaltinis nežinomas) — laukiama vartotojo patvirtinimo, kuri reikšmė teisinga`
  );
  return `[Neišspręsti faktų prieštaravimai]\n${lines.join("\n")}`;
}

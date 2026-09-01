/**
 * F5 closure — live vertical field-conflict state (rooms / workType).
 *
 * ONE small, deterministic, category-neutral conflict-state reducer used for
 * BOTH `rooms` (REAL_ESTATE) and `workType` (JOBS) through the real live
 * `runVautoAgent` draft-update path. Marker convention mirrors the certified
 * Phase 2B year-conflict convention: `${field}Conflict` ("" tombstone on
 * resolution) and `${field}ConflictCandidate`.
 *
 * Whitelist only — dynamic/unchecked field names are impossible by typing;
 * a category that does not own the field can never create its markers.
 *
 * Semantics (identical state machine for every whitelisted field):
 *   - no prior value, incoming A        → accept A;
 *   - prior A, incoming A (equal)       → no conflict;
 *   - prior A, incoming B (different)   → A stays canonical, B becomes
 *                                          candidate, markers set;
 *   - conflict active, unrelated turn   → markers untouched;
 *   - conflict active, choose A or B    → chosen becomes canonical, markers
 *                                          cleared ("" tombstones);
 *   - conflict active, third C          → fail-closed: A stays canonical,
 *                                          markers preserved, C discarded.
 */
export const VERTICAL_CONFLICT_FIELDS = {
  rooms: "real_estate",
  workType: "jobs",
} as const;

export type VerticalConflictField = keyof typeof VERTICAL_CONFLICT_FIELDS;

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
  const priorConflict = String(priorAttrs[conflictKey] ?? "") === "true";
  const priorCanonical = String(priorAttrs[input.field] ?? "").trim();
  const priorCandidate = String(priorAttrs[candidateKey] ?? "").trim();
  const incoming = String(input.incomingValue ?? "").trim();

  if (priorConflict) {
    if (!incoming) return {};
    if (incoming === priorCanonical || incoming === priorCandidate) {
      return { [input.field]: incoming, [conflictKey]: "", [candidateKey]: "" };
    }
    return {
      [input.field]: priorCanonical,
      [conflictKey]: "true",
      [candidateKey]: priorCandidate,
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
 * F5 closure — deterministic rooms extraction: only explicit bounded positive
 * integer LT forms ("2 kambariai", "3 kambarių", "2 k."). Areas, years and
 * prices are never interpreted as rooms. No LLM involved.
 */
export function extractRoomsFromChat(text: string): string | undefined {
  const t = String(text ?? "");
  const m = t.match(/\b(\d{1,2})\s*(?:kamb\w*\b|k\.)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n <= 0 || n > 30) return undefined;
  return String(n);
}

/**
 * F5 closure — deterministic workType extraction: only the three explicit
 * canonical variants (Biure / Nuotoliu / Hibridas) with reasonable LT/EN
 * inflections and case/whitespace tolerance. The bare word "darbas" is never
 * a workType. No LLM involved.
 */
export function extractWorkTypeFromChat(text: string): string | undefined {
  const t = String(text ?? "").toLowerCase();
  if (/\b(biur\w*|ofis\w*|on[\s-]?site)\b/.test(t)) return "Biure";
  if (/\b(nuotoli\w*|remote|distancin\w*)\b/.test(t)) return "Nuotoliu";
  if (/\b(hibrid\w*|hybrid|mi[sš]r\w*)\b/.test(t)) return "Hibridas";
  return undefined;
}

/**
 * R4.1 — field-authority merge (category-neutral, lightweight).
 *
 * Determinism owns hard facts/state; the model owns interpretation. This
 * module gives the live chat/vision draft a small, reusable merge rule so an
 * explicit human correction/claim is not silently overwritten by a later
 * model/visual inference. It is deliberately NOT the R2 description
 * publication-authority mechanism: `confirmationToken` remains the special
 * whole-description publication consent, while this contract only records WHO
 * supplied/corrected a value (USER_CORRECTION > USER_CLAIM > inference).
 */

export type FieldAuthoritySource =
  | "USER_CLAIM"
  | "USER_CORRECTION"
  | "MODEL_INFERENCE"
  | "VISUAL_OBSERVATION";

const HUMAN_SOURCES: ReadonlySet<string> = new Set([
  "USER_CLAIM",
  "USER_CORRECTION",
]);
const INFERENCE_SOURCES: ReadonlySet<string> = new Set([
  "MODEL_INFERENCE",
  "VISUAL_OBSERVATION",
]);

export function isHumanAuthoritativeSource(
  source: string | null | undefined
): boolean {
  return source === "USER_CORRECTION" || source === "USER_CLAIM";
}

export interface FieldAuthorityInput {
  value: string | undefined;
  source: FieldAuthoritySource | undefined;
}

export interface FieldAuthorityResult {
  value: string | undefined;
  source: FieldAuthoritySource | undefined;
  conflict: boolean;
}

function norm(v: string | undefined): string {
  return (v ?? "").trim();
}

/**
 * Resolve one field between a prior value and an incoming (model/vision) value.
 *
 * Precedence (weakest → strongest):
 *   MODEL_INFERENCE / VISUAL_OBSERVATION → USER_CLAIM → USER_CORRECTION.
 *
 * Rules: incoming empty → keep prior; prior empty → take incoming; same value
 * → keep stronger source; incoming USER_CORRECTION → replaces anything;
 * prior human + incoming inference (different) → keep prior; otherwise take
 * incoming and flag `conflict` (never silently dropped).
 */
export function resolveFieldAuthority(
  prior: FieldAuthorityInput,
  incoming: FieldAuthorityInput
): FieldAuthorityResult {
  const priorValue = norm(prior.value);
  const incomingValue = norm(incoming.value);

  if (!incomingValue) {
    return { value: prior.value, source: prior.source, conflict: false };
  }
  if (!priorValue) {
    return { value: incoming.value, source: incoming.source, conflict: false };
  }

  const priorHuman = HUMAN_SOURCES.has(prior.source ?? "");
  const incomingInference = INFERENCE_SOURCES.has(incoming.source ?? "");

  if (priorValue === incomingValue) {
    const source = priorHuman ? prior.source : incoming.source ?? prior.source;
    return { value: prior.value, source, conflict: false };
  }

  if (incoming.source === "USER_CORRECTION") {
    return { value: incoming.value, source: incoming.source, conflict: false };
  }

  if (priorHuman && incomingInference) {
    return { value: prior.value, source: prior.source, conflict: false };
  }

  return { value: incoming.value, source: incoming.source, conflict: true };
}

export type FieldAuthorityAttrs = Record<string, string | undefined>;

/**
 * Single draft attribute listing which field keys were explicitly supplied or
 * corrected by the current user. A pipe-delimited list avoids per-field marker
 * collisions with existing provenance attributes (e.g. descriptionSource,
 * deferredSalesDescriptionSource).
 */
export const USER_CORRECTED_FIELDS_KEY = "userCorrectedFields";

function readCorrectedFields(attrs: FieldAuthorityAttrs | undefined): Set<string> {
  const raw = attrs?.[USER_CORRECTED_FIELDS_KEY];
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isFieldUserCorrected(
  attrs: FieldAuthorityAttrs | undefined,
  field: string
): boolean {
  return readCorrectedFields(attrs).has(field);
}

export function markUserCorrectedField<T extends FieldAuthorityAttrs>(
  attrs: T,
  field: string
): T {
  const set = readCorrectedFields(attrs);
  set.add(field);
  return {
    ...attrs,
    [USER_CORRECTED_FIELDS_KEY]: Array.from(set).join("|"),
  } as T;
}

function foldLtText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * True when a corrected value is grounded in the user's own words: at least
 * half of its significant tokens (>=3 chars) appear in the user utterance
 * (diacritic/ASCII folded). Used to distinguish an explicit user correction
 * (e.g. „ji tamsiai mėlyna") from a model-inferred value the user never stated.
 */
export function valueGroundedInUserText(
  value: string,
  userText: string
): boolean {
  const v = (value ?? "").trim();
  const hay = (userText ?? "").trim();
  if (!v || !hay) return false;
  const tokens = foldLtText(v)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  const foldedHay = foldLtText(hay);
  const matches = tokens.filter((t) => foldedHay.includes(t));
  return matches.length / tokens.length >= 0.5;
}

/**
 * Merge incoming (model/vision) attribute values over prior draft attributes,
 * honoring the `userCorrectedFields` marker. A user-corrected prior value that
 * differs from the incoming inference is kept; non-conflicting new evidence is
 * added. The marker key itself is never copied from the incoming map.
 */
export function mergeFieldAuthorityAttrs(
  prior: FieldAuthorityAttrs,
  incoming: FieldAuthorityAttrs,
  _incomingSource: FieldAuthoritySource
): FieldAuthorityAttrs {
  const out: FieldAuthorityAttrs = { ...prior };
  const corrected = readCorrectedFields(prior);
  for (const [key, value] of Object.entries(incoming)) {
    if (key === USER_CORRECTED_FIELDS_KEY) continue;
    if (value === undefined || value === null) continue;
    if (corrected.has(key)) {
      const priorValue = prior[key];
      if (
        priorValue !== undefined &&
        String(priorValue) !== String(value)
      ) {
        continue; // explicit human value survives model/vision inference
      }
    }
    out[key] = value;
  }
  return out;
}

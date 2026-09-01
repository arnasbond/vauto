/**
 * F5 — shared search disambiguation (SINGLE source for all classifiers).
 *
 * No new registry and no broader search refactor: two small, deterministic
 * predicates shared by `parseUniversalSearchQuery` (F3) and
 * `extractProductSearchIntent` / `inferSearchCategory` (legacy chain).
 *
 * 1. Office furniture as the SEARCH OBJECT — "ieškau darbo kėdės / stalo"
 *    is a HOME-good search, NOT a job search. A profession / activity /
 *    sales continuation ("staliaus", "kėdžių gamyboje", "baldų gamintoju",
 *    "kėdžių pardavėju") keeps the query in JOBS. No broad `stal*` / `bald*`
 *    stems that would swallow professions.
 *
 * 2. Car accessories — "automobilio sėdynių užvalkalai / kilimėliai" are
 *    HOME goods, NOT vehicles.
 */

/** Furniture ITEM objects (precise forms only — never profession stems). */
const OFFICE_FURNITURE_OBJECT_RE =
  /\b(k[ėe]d(?:[ėę]s?|es)?|st[ao]l(?:o|as|u|ą)?)\b/i;

/** Profession / activity / sales continuations that keep the query in JOBS. */
const JOB_ROLE_CONTINUATION_RE =
  /\b(stali(?:aus|umi|us|[ųu])|gamintoj\w*|gamyb\w*|gamint\w*|pardav[ėe]j\w*|pardavim\w*|meistr\w*|specialist\w*|operatori\w*|vadybinink\w*|dirbti)\b/i;

/** "ieškau darbo X" prefix. */
const JOB_SEEK_PREFIX_RE = /\b(ie[sš]kau|ieskau|ie[sš]kojau|ieskojau|rask|noriu|reikia)\s+darbo\b/i;

/** Bare "darbo <furniture-item>" form (no seek verb). */
const BARE_FURNITURE_PREFIX_RE =
  /\bdarbo\s+(?:k[ėe]d(?:[ėę]s?|es)?|st[ao]l(?:o|as|u|ą)?)\b/i;

/**
 * True when the utterance seeks an OFFICE-FURNITURE ITEM (home goods),
 * false for professions/activities/sales contexts and for everything else.
 * Handles both the seek-verb form ("ieškau darbo kėdės") and the bare form
 * ("darbo kėdė").
 */
export function isOfficeFurnitureSearch(text: string): boolean {
  if (JOB_ROLE_CONTINUATION_RE.test(text)) return false;
  if (!OFFICE_FURNITURE_OBJECT_RE.test(text)) return false;
  if (JOB_SEEK_PREFIX_RE.test(text)) return true;
  return BARE_FURNITURE_PREFIX_RE.test(text);
}

/** Car-accessory context: "automobilio <accessory>" is HOME goods, not vehicles. */
const CAR_ACCESSORY_CONTEXT_RE =
  /\bautomobil\w*\s+(?:u[zž]valkal\w*|kilimėl\w*|laikikl\w*|dangt\w*|s[ėe]dyn\w*)\b/i;

export function isCarAccessorySearch(text: string): boolean {
  return CAR_ACCESSORY_CONTEXT_RE.test(text);
}

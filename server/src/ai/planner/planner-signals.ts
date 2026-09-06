/**
 * E2.5 — SHARED deterministic planning signals.
 *
 * These regex/heuristic signals are the POLICY/anti-hijack vocabulary used
 * BOTH by the deterministic fallback planner AND the deterministic policy
 * clamps around the LLM-first planner. They are NOT the reasoning authority:
 * the model still owns open-domain understanding; these signals only define
 * the safety boundaries (ambiguous-noun anti-hijack, cancel, consequential,
 * financial, publish) and the high-confidence fast-paths.
 */
import { extractProductSearchIntent } from "../product-search-query.js";
import { resolveUniversalSearchQuery } from "../search/universal-search-query.js";
import { VEHICLE_MAKES } from "../vehicle-attribute-extract.js";

/** Financial / wallet commands — NEVER catalog search, NEVER model authority. */
export const FINANCIAL_COMMAND_RE =
  /\b(perkelk|perkelti|pervesk|pervesti|transfer|apmok[ėe]k|mok[ėe]k|išsiimk|issiimk)\b|wallet\b.*\b(perkel|perves|išsi|issi|transfer)/i;

/** Consequential-action commands — recognition is DETERMINISTIC (authority);
 *  execution stays behind the confirmation boundary. */
export const CONSEQUENTIAL_COMMAND_RE =
  /\bpažym[ėe]k\b.*\b(parduot|pardav)|mark\s*listing\s*sold|blokuok|užblokuok|ublokuok/i;

/** Cancel / hold markers — the user stops a publish flow. */
export const CANCEL_MARKER_RE =
  /^(?:ne\s*,?\s*)?(?:dar\s+)?ne\b|palauk|pala|luktel|kol kas ne|neskelbk|nepublikuok|sustokim|nereikia|atšauk|atsauk|stabdyk|dar\s+nenoriu|nenoriu\s+(?:publikuoti|skelbti)/i;

/** Publish-intent markers — an unauthenticated publish never degrades to search. */
export const PUBLISH_INTENT_MARKER_RE =
  /\b(publikuok|paskelbk|publikavim[ąa]|publikuojam)\b/i;

/** Search verbs — an explicit catalog search request. „reikia“ alone is NOT
 *  a search signal („man reikia patarimo“). */
export const SEARCH_VERB_RE =
  /\b(ieškau|ieskau|ieškok|ieskok|rask|surask|paieškok|paieskok|noriu\s+(?:rasti|pirkti)|find|search)\b/i;

/** Correction markers — the user corrects a previous statement. */
export const CORRECTION_MARKER_RE =
  /\b(vis\s+dėlto|vistiek|turėjau\s+omenyje|turejau\s+omenyje|vietoj|apsigalvojau)\b|^ne\s*,?\s+ne\b/i;

/** Question markers — the user asks about state/history/counts. */
export const QUESTION_MARKER_RE =
  /\?\s*$|\b(kiek|koks|kokia|kokį|kokios|kokią|kur|kada|kaip|kod[ėe]l|kuris|kuri|kokiu|kokio)\b/i;

/**
 * E2.6 — META questions about the assistant ITSELF (capabilities,
 * identity) stay `dialog`; every other interrogative normalizes to
 * `context_question`. Class-based, not a phrase dictionary.
 */
export const META_ASSISTANT_QUESTION_RE =
  /\b(ką\s+tu\s+(?:gali|moki|darai)|ką\s+(?:gali|moki)\b|kas\s+tu\b|tavo\s+(?:galimyb[ėe]s?|funkcij\w*))\b/i;

/** E2.6 — is the utterance interrogative (a question, not a statement)? */
export function isInterrogative(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || QUESTION_MARKER_RE.test(text);
}

/**
 * E2.8 — ADVISORY markers: the user asks for advice/help/deciding instead
 * of commanding a search. A semantic CLASS (advice verbs + indecision
 * phrases), never a phrase dictionary.
 */
export const ADVISORY_MARKER_RE =
  /\b(siūlytum|siūlytumėt|siulytum|siulytumet|rekomenduotum|rekomenduotumėt|rekomenduotumet|patartum|patartumėt|patartumet|patark|pad[ėe]k\s+(?:man\s+)?(?:išsirinkti|rinktis|pasirinkti|apsispr[ęe]sti|nuspr[ęe]sti)|nežinau\s+(?:ko|ką)\b|neturiu\s+(?:konkretaus|aiškaus)\b|kok(?:į|ią)\s+patartum)\b/i;

/**
 * E2.8 — advisory/interrogative utterances (advice-seeking) must NEVER be
 * auto-converted into catalog_search by facet signals alone. An explicit
 * search verb keeps the search intent.
 */
export function isAdvisoryInterrogative(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return ADVISORY_MARKER_RE.test(t) && !SEARCH_VERB_RE.test(t.toLowerCase());
}

/** Dialog stopwords — a phrase containing any of these is NOT a product noun. */
export const DIALOG_STOPWORD_RE =
  /\b(pad[ėe]k|papasakok|paaiškink|paaiskink|parodyk|rodyk|noriu|gal|prašau|prasau|patark|duok|aš|as|man|mano|persigalvojau)\b/i;

/** How strongly the phrase looks like a marketplace product noun. */
export function productNounScore(text: string): number {
  const intent = extractProductSearchIntent(text);
  const kw = intent.keyword.trim().replace(/[.,!?]+$/g, "");
  if (intent.categoryBrowse) return 2;
  if (kw.length >= 2) return 1;
  return 0;
}

/**
 * E2.5 — a BARE ambiguous marketplace noun: short phrase, product-ish, no
 * search verb, no question, no price/digit phrase, no dialog stopwords.
 * Such phrases must NEVER auto-route to catalog search.
 */
export function isBareAmbiguousNoun(text: string): boolean {
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    words.length >= 1 &&
    words.length <= 2 &&
    productNounScore(text) > 0 &&
    !SEARCH_VERB_RE.test(lower) &&
    !QUESTION_MARKER_RE.test(text) &&
    !/\d/.test(text) &&
    !/\b(kaina|eur|€|kainos)\b/i.test(lower) &&
    !DIALOG_STOPWORD_RE.test(lower)
  );
}

/**
 * E2.8 — EXPLICIT WANTED semantic class (watch / notify-when-available).
 *
 * A first-class capability boundary, NOT a phrase hardcode: the utterance
 * must carry BOTH
 *   A. an explicit notify/watch meaning, AND
 *   B. a plausible marketplace target (price bound, catalog category, or a
 *      grounded make token present in the user's own words).
 * Generic sentences like „pranešk, kai baigsi redaguoti skelbimą" or
 * „pranešk pardavėjui, kad atvažiuosiu rytoj" carry NO when-available
 * meaning / NO catalog target and are NOT wanted requests.
 */
const WANTED_NOTIFY_ANCHOR_RE =
  /\b(pranešk(?:ite)?(?:\s+man)?|pranešimą|pranešimo|pranešti|informuok(?:ite)?(?:\s+man)?|stebėk(?:ite)?|sek(?:ti|ite)?\s+kain\p{L}*|watchlist|notify\s+me|alert\s+me)(?=\W|$)/iu;

const WANTED_WHEN_AVAILABLE_RE =
  /\b(kai|jei|jeigu)\s+atsiras\b|\batsiras\b[^.!?]{0,80}\b(pranešk|pranešti|pranešimą|informuok)(?=\W|$)|\bwhen\s+(?:it\s+)?becomes?\s+available\b/iu;

function foldLower(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

const FOLDED_VEHICLE_MAKES: ReadonlySet<string> = new Set(
  VEHICLE_MAKES.map((m) => foldLower(m))
);

export function isExplicitWantedRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!WANTED_NOTIFY_ANCHOR_RE.test(t)) return false;
  if (!WANTED_WHEN_AVAILABLE_RE.test(t)) return false;
  const uq = resolveUniversalSearchQuery(t);
  if (uq.query.priceMin != null || uq.query.priceMax != null) return true;
  if (uq.query.canonicalCategory !== "other") return true;
  const folded = foldLower(t);
  const tokens = new Set(folded.split(/\s+/));
  return [...FOLDED_VEHICLE_MAKES].some(
    (m) => tokens.has(m) || (m.includes(" ") && folded.includes(m))
  );
}

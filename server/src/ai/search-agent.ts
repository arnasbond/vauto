/** Server-side intent guard — conversational utterances skip dry DB search. */

const GREETING_RE =
  /^(labas|sveikas|sveiki|sveika|laba\s+diena|labas\s+rytas|labas\s+vakaras|hey|hi|hello)\b/i;

const HELP_RE =
  /\b(pad[eė]k\s+(man|manę|mui)|kuo\s+(gali|galite)\s+(man|pad[eė]ti)|help|reikia\s+pagalbos)\b/i;

const GENERIC_BUY_RE =
  /\b(nor[eė]čiau|noreciau|noriu)\s+(nusipirkti|pirkti|apsipirkti)\b/i;

const NEGOTIATION_RE =
  /\b(der[eė)tis|deryb|geresn[eę]\s+kain|sumažink|sumažinkite|per brangu)\b/i;

const PRODUCT_HINT_RE =
  /\b(bmw|audi|volvo|mercedes|toyota|vw|ford|opel|iphone|samsung|butas|namas|drabuž|batai|automob|auto\b|nt\b|darbas|meistr|paslaug)\b/i;

const SEARCH_VERB_RE =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk|rodyti|find|search|show)\b/i;

function normalizeIntentText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[!?.,…]+$/g, "")
    .trim();
}

export function isConversationalSearchIntent(text: string | null | undefined): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;

  const t = normalizeIntentText(raw);
  if (!t) return false;

  if (SEARCH_VERB_RE.test(t) && PRODUCT_HINT_RE.test(t)) return false;
  if (GREETING_RE.test(t)) return true;
  if (HELP_RE.test(t)) return true;
  if (NEGOTIATION_RE.test(t) && !PRODUCT_HINT_RE.test(t)) return true;
  if (GENERIC_BUY_RE.test(t) && !PRODUCT_HINT_RE.test(t)) return true;

  return false;
}

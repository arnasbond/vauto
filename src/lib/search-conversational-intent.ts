import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";

const GREETING_RE =
  /^(labas|sveikas|sveiki|sveika|laba\s+diena|labas\s+rytas|labas\s+vakaras|hey|hi|hello|čia|cia)\b/i;

const HELP_RE =
  /\b(pad[eė]k\s+(man|manę|mui)|kuo\s+(gali|galite)\s+(man|pad[eė]ti)|help|reikia\s+pagalbos)\b/i;

const GENERIC_BUY_RE =
  /\b(nor[eė]čiau|noreciau|noriu)\s+(nusipirkti|pirkti|apsipirkti)\b/i;

const NEGOTIATION_RE =
  /\b(der[eė)tis|deryb|geresn[eę]\s+kain|sumažink|sumažinkite|per brangu)\b/i;

const PRODUCT_HINT_RE =
  /\b(bmw|audi|volvo|mercedes|toyota|vw|ford|opel|iphone|samsung|macbook|butas|namas|sklypas|drabuž|batai|striuk|suknel|megz|kailin|automob|auto\b|nt\b|darbas|meistr|paslaug)\b/i;

const SEARCH_VERB_RE =
  /^(?:ieškau|ieskau|i\s*eškau|i\s*eskau|rask|surask|parodyk|rodyti|find|search|show)\b/i;

function normalizeIntentText(text: string): string {
  return sanitizeSearchQuery(text, "final")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[!?.,…]+$/g, "")
    .trim();
}

/** Ar užklausa — pasisveikinimas / pagalba / derybos, o ne produkto paieška? */
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

  if (t.length <= 48 && !PRODUCT_HINT_RE.test(t)) {
    if (/^(kaip\s+sekasi|kas\s+naujo|ačiū|aciu|dekuoju)\b/.test(t)) return true;
  }

  return false;
}

/** Momentinis TTS atsakymas kol Gemini generuoja pilną atsakymą. */
export function buildConversationalLiveReply(userName?: string): string {
  const first = userName?.trim().split(/\s+/)[0];
  if (first && first !== "Svečias" && first.length > 1) {
    return `Labas, ${first}! Kuo galiu padėti — surasti, parduoti ar derėtis?`;
  }
  return "Labas! Kuo galiu padėti — surasti, parduoti ar derėtis?";
}

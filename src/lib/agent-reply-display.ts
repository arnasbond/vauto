/** Strip internal tool codes from user-visible agent chat text. */

const INTERNAL_TOOL_RE =
  /\b(searchListings|SEARCHLISTINGS|triggerMicroPayment|block_listing|register_wanted|listing_draft|empty_search|micro_payment)\b/gi;

const TRAILING_PUNCT_RE = /^[\s.,;:!?·]+|[\s.,;:!?·]+$/g;

export function sanitizeAgentReplyForDisplay(text: string): string {
  const cleaned = text
    .replace(INTERNAL_TOOL_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(TRAILING_PUNCT_RE, "")
    .trim();

  if (!cleaned) return "";
  if (/^rezultat[uų]\s+nerasta\.?$/i.test(cleaned)) {
    return buildEmptySearchReply();
  }
  return cleaned;
}

export function buildEmptySearchReply(query?: string): string {
  const q = query?.trim();
  if (q && q.length >= 2) {
    return `Deja, pagal „${q}" nieko tinkamo neradau. Pabandykime kitą frazę ar filtrus.`;
  }
  return "Deja, šiuo metu nieko neradau. Pabandykime kitą paiešką ar filtrus.";
}

/** Voice TTS — max 2–3 sentences for APK/WebView clarity. */
export function truncateVoiceReply(text: string, maxSentences = 3): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [trimmed];
  if (sentences.length <= maxSentences) return trimmed;
  return sentences.slice(0, maxSentences).join(" ").trim();
}

/** Strip internal tool codes from user-visible agent chat text. */

const INTERNAL_TOOL_RE =
  /\b(searchListings|SEARCHLISTINGS|triggerMicroPayment|block_listing|register_wanted|listing_draft|empty_search|micro_payment)\b/gi;

const TRAILING_PUNCT_RE = /^[\s.,;:!?·]+|[\s.,;:!?·]+$/g;

const PROACTIVE_INTERNAL_RE = /^\[Proaktyvi intervencija:/i;

export function isProactiveInternalAgentText(text: string): boolean {
  return PROACTIVE_INTERNAL_RE.test(text.trim());
}

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

/** Parse alternative options from proactive assistant questions or structured chips. */
export function extractAgentQuickReplies(text: string): string[] {
  const bracketChips = [...text.matchAll(/\[([^\]]{3,72})\]/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (bracketChips.length >= 2) {
    return [...new Set(bracketChips)].slice(0, 4);
  }

  const t = sanitizeAgentReplyForDisplay(text);
  if (!t.includes("?")) return [];

  const questionBody = t.match(/ar\s+([\s\S]+?)\?/i)?.[1]?.trim();
  if (!questionBody) return [];

  const parts = questionBody
    .split(/\s*,\s*(?=(?:ar|o\s+gal)\s+)/i)
    .flatMap((segment) => segment.split(/\s+o\s+gal\s+/i))
    .map((s) =>
      s
        .replace(/^(?:ar|norite|noriu|norėtumėte|gal)\s+/i, "")
        .replace(/\s+(?:pasirinkite|patikslinkite).*$/i, "")
        .trim()
    )
    .filter((s) => s.length >= 3 && s.length <= 72);

  const unique = [...new Set(parts)];
  return unique.length >= 2 ? unique.slice(0, 4) : [];
}

export function buildEmptySearchReply(query?: string): string {
  const q = query?.trim();
  if (q && q.length >= 2) {
    return `Deja, pagal „${q}" nieko tinkamo neradau. Gal pabandyti elektroniką, drabužius ar platesnę paiešką? Galiu ir užfiksuoti tavo norą fone.`;
  }
  return "Deja, šiuo metu nieko neradau. Pabandykime kitą frazę — arba pasakyk, ką tiksliai ieškai, ir pasiūlysiu alternatyvų.";
}

/** Voice TTS — max 2–3 sentences for APK/WebView clarity. */
export function truncateVoiceReply(text: string, maxSentences = 3): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [trimmed];
  if (sentences.length <= maxSentences) return trimmed;
  return sentences.slice(0, maxSentences).join(" ").trim();
}

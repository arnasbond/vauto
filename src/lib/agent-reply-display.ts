/** Strip internal tool codes from user-visible agent chat text. */

import { buildBrowseAllReply as buildBrowseAllIntentReply } from "@/lib/browse-all-intent";

const INTERNAL_TOOL_RE =
  /\b(searchListings|SEARCHLISTINGS|triggerMicroPayment|block_listing|register_wanted|listing_draft|empty_search|micro_payment)\b/gi;

const TRAILING_PUNCT_RE = /^[\s.,;:!?·]+|[\s.,;:!?·]+$/g;

const PROACTIVE_INTERNAL_RE = /^\[Proaktyvi intervencija:/i;

export function isProactiveInternalAgentText(text: string): boolean {
  return PROACTIVE_INTERNAL_RE.test(text.trim());
}

/**
 * Normalize / strip raw ATX markdown headings so chat never shows literal `##`.
 * Proper line-start headings become plain section titles; mid-line `##` markers are removed.
 */
export function stripRawMarkdownHeadingMarkers(text: string): string {
  return String(text ?? "")
    // Mid-line "## Foo" leaked into list items → drop markers, keep words.
    .replace(/([^\n#])[ \t]*#{1,6}[ \t]+/g, "$1 ")
    // Line-start ATX headings → keep title text only (AgentChatMarkdown still styles prose).
    .replace(/^[ \t]*#{1,6}[ \t]+(.+)$/gm, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function sanitizeAgentReplyForDisplay(text: string): string {
  const cleaned = stripRawMarkdownHeadingMarkers(text)
    .replace(INTERNAL_TOOL_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(TRAILING_PUNCT_RE, "")
    .trim();

  if (!cleaned) return "";
  if (/^rezultat[uų]\s+nerasta\.?$/i.test(cleaned)) {
    return "";
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

export function buildBrowseAllReply(listingCount?: number): string {
  return buildBrowseAllIntentReply(listingCount);
}

/** Voice TTS — max 2–3 sentences for APK/WebView clarity. */
export function truncateVoiceReply(text: string, maxSentences = 3): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [trimmed];
  if (sentences.length <= maxSentences) return trimmed;
  return sentences.slice(0, maxSentences).join(" ").trim();
}

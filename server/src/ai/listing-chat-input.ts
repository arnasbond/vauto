const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
const PRICE_INLINE_RE = /(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|eurų|euro)/i;

export function isListingConversationInput(
  text: string,
  listingDraft?: { title?: string; price?: number } | null
): boolean {
  if (!listingDraft) return false;
  const t = text.trim();
  if (!t) return false;
  if (PRICE_ONLY_RE.test(t)) return true;
  if (PRICE_INLINE_RE.test(t)) return true;
  return t.length <= 160;
}

export function parsePriceFromChatInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (PRICE_ONLY_RE.test(t)) {
    const raw = t.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  const inline = t.match(PRICE_INLINE_RE);
  if (inline?.[1]) {
    const n = Number.parseFloat(inline[1].replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  return null;
}

export function buildListingChatPriceReply(price: number, title?: string): string {
  const label = title?.trim();
  return label
    ? `Gerai — ${label}: kaina ${price} €. Ar dar ką nors patikslinsime prieš publikuojant?`
    : `Gerai, įrašiau kainą — ${price} €. Ar dar ką nors patikslinsime prieš publikuojant?`;
}

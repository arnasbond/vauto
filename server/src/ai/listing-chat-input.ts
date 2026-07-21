import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { isListingWorkflowCommand } from "./listing-workflow-intent.js";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
const PRICE_INLINE_RE =
  /(?:kaina|uz|už|price|eur(?:ais|u|ų)?|€)?\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|eurų|euro)?\b/i;
const PRICE_BARE_IN_SHORT_RE =
  /(?:^|[^\d])(\d{3,7})(?:[.,]\d{1,2})?(?=[^\d]|$)/;

export interface ListingDraftContext {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
  allowPastomatas?: boolean;
  listingFlowState?:
    | "DRAFTING_TEXT"
    | "AWAITING_PHOTOS"
    | "DRAFT_READY"
    | "AWAITING_CONFIRMATION";
}

export function isListingConversationInput(
  text: string,
  listingDraft?: { title?: string; price?: number } | null
): boolean {
  if (!listingDraft) return false;
  const t = text.trim();
  if (!t) return false;
  if (isListingWorkflowCommand(t)) return false;
  if (PRICE_ONLY_RE.test(t)) return true;
  if (parsePriceFromChatInput(t) != null) return true;
  return t.length <= 160;
}

export function parsePriceFromChatInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  if (PRICE_ONLY_RE.test(t)) {
    const raw = t.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n) : null;
  }

  const withCurrency = t.match(
    /(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:ų|u|ais)?)/i
  );
  if (withCurrency?.[1]) {
    const n = Number.parseFloat(withCurrency[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && /€|eur/i.test(withCurrency[0])) {
      return Math.round(n);
    }
  }

  const kaina = t.match(
    /\b(?:kaina|price|uz|už)\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)/i
  );
  if (kaina?.[1]) {
    const n = Number.parseFloat(kaina[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  const inline = t.match(PRICE_INLINE_RE);
  if (inline?.[1]) {
    const n = Number.parseFloat(inline[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n < 100_000_000) return Math.round(n);
  }

  if (t.length <= 80) {
    const bare = t.match(PRICE_BARE_IN_SHORT_RE);
    if (bare?.[1]) {
      const n = Number.parseInt(bare[1], 10);
      if (Number.isFinite(n) && n >= 50 && (n < 1900 || n > 2099)) return n;
    }
  }

  return null;
}

export function buildListingChatPriceReply(
  price: number,
  draft: ListingDraftContext
): string {
  return buildListingDraftUpdateReply(
    {
      category: draft.category,
      title: draft.title,
      description: draft.description,
      price,
      location: draft.location,
      attributes: draft.attributes,
    },
    { intro: "Puiku — atnaujinau kainą!" }
  );
}

/** Map partial wizard draft to strict listing_draft side-effect payload. */
export function normalizeListingDraftForAction(
  draft: ListingDraftContext,
  opts?: {
    price?: number;
    contact?: string;
    confidence?: number;
    userCity?: string;
    listingFlowState?: ListingDraftContext["listingFlowState"];
  }
): {
  title: string;
  description?: string;
  price: number;
  location: string;
  contact: string;
  category: string;
  confidence: number;
  attributes?: Record<string, string>;
  allowPastomatas?: boolean;
  listingFlowState?: ListingDraftContext["listingFlowState"];
} {
  const listingFlowState = opts?.listingFlowState ?? draft.listingFlowState;
  return {
    title: draft.title?.trim() || "Naujas skelbimas",
    description: draft.description,
    price: opts?.price ?? draft.price ?? 0,
    location: draft.location?.trim() || opts?.userCity?.trim() || "Lietuva",
    contact: opts?.contact?.trim() || "",
    category: draft.category?.trim() || "other",
    confidence: opts?.confidence ?? 0.9,
    attributes: draft.attributes,
    allowPastomatas:
      draft.allowPastomatas === undefined ? undefined : draft.allowPastomatas,
    ...(listingFlowState ? { listingFlowState } : {}),
  };
}

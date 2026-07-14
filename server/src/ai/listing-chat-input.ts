import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { isListingWorkflowCommand } from "./listing-workflow-intent.js";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
const PRICE_INLINE_RE = /(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|eurų|euro)/i;

export interface ListingDraftContext {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
  allowPastomatas?: boolean;
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
} {
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
      typeof draft.allowPastomatas === "boolean" ? draft.allowPastomatas : true,
  };
}

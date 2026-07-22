import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { isListingWorkflowCommand } from "./listing-workflow-intent.js";
import {
  hardFilterPublicGalleryUrls,
  parseDocumentUrlsFromAttributes,
} from "./listing-gallery-roles.js";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
const PRICE_EXPLICIT_RE =
  /(?:(?:kaina|uz|už|price)\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:ų|u|ais)?))/i;
const PRICE_BARE_IN_SHORT_RE =
  /(?:^|[^\d])(\d{3,7})(?:[.,]\d{1,2})?(?=[^\d]|$)/;

function isLikelyVehicleYear(n: number): boolean {
  return Number.isInteger(n) && n >= 1985 && n <= 2026;
}

export interface ListingDraftContext {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
  allowPastomatas?: boolean;
  /** Public product gallery (excludes tech passport / document evidence). */
  orderedImageUrls?: string[];
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

  const explicit = t.match(PRICE_EXPLICIT_RE);
  if (explicit) {
    const raw = (explicit[1] || explicit[2] || "").replace(",", ".");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0 && n < 100_000_000) return Math.round(n);
  }

  if (PRICE_ONLY_RE.test(t)) {
    const hasCurrency = /€|eur/i.test(t);
    const raw = t.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0 || n >= 100_000_000) return null;
    if (!hasCurrency && isLikelyVehicleYear(Math.round(n))) return null;
    return Math.round(n);
  }

  if (t.length <= 80) {
    const bare = t.match(PRICE_BARE_IN_SHORT_RE);
    if (bare?.[1]) {
      const n = Number.parseInt(bare[1], 10);
      if (Number.isFinite(n) && n >= 50 && !isLikelyVehicleYear(n)) return n;
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
  orderedImageUrls?: string[];
  listingFlowState?: ListingDraftContext["listingFlowState"];
} {
  const listingFlowState = opts?.listingFlowState ?? draft.listingFlowState;
  const documentUrls = parseDocumentUrlsFromAttributes(draft.attributes);
  const publicGallery = hardFilterPublicGalleryUrls(
    draft.orderedImageUrls,
    documentUrls,
    draft.attributes
  ).slice(0, 6);
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
    ...(publicGallery.length ? { orderedImageUrls: publicGallery } : {}),
    ...(listingFlowState ? { listingFlowState } : {}),
  };
}

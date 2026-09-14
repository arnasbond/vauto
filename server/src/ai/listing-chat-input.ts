import { buildListingDraftUpdateReply } from "./listing-draft-preview.js";
import { isListingWorkflowCommand } from "./listing-workflow-intent.js";
import {
  hardFilterPublicGalleryUrls,
  parseDocumentUrlsFromAttributes,
} from "./listing-gallery-roles.js";
import { isNegotiablePriceChatInput } from "../shared/negotiable-price.js";
import { coerceListingCategoryForDb } from "../shared/category-registry.js";
import { parseDisambiguatedPrice } from "../shared/price-year-disambiguation.js";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;

export interface ListingDraftContext {
  title?: string;
  description?: string;
  price?: number;
  priceLabel?: string;
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

const DRAFT_EDIT_SIGNAL_RE =
  /\b(patais|pataisyti|pakeisk|keisk|atnaujink|ištrink|istrink|neberaš|neberasy|nerašyk|nerasyk|neberašyti|neberasyti|pašalink|pasalink|pridėk|pridek|\d{2,3}\s*kw)\b/i;

export function isListingConversationInput(
  text: string,
  listingDraft?: { title?: string; price?: number } | null
): boolean {
  if (!listingDraft) return false;
  const t = text.trim();
  if (!t) return false;
  if (isListingWorkflowCommand(t)) return false;
  if (isNegotiablePriceChatInput(t)) return true;
  if (PRICE_ONLY_RE.test(t)) return true;
  if (parsePriceFromChatInput(t) != null) return true;
  if (DRAFT_EDIT_SIGNAL_RE.test(t)) return true;
  // Active draft: ChatGPT-style — any informal correction is UPDATE_LISTING_DRAFT.
  if (t.length <= 500) return true;
  return t.length <= 160;
}

/** Remove unwanted description phrases from natural-language edit requests. */
export function applyNaturalLanguageDescriptionEdits(
  description: string,
  userText: string
): { description: string; removed: string[] } {
  let next = String(description ?? "");
  const removed: string[] = [];
  const lower = userText.toLowerCase();
  const banMatch = userText.match(
    /(?:neberašyti|neberasyti|nerašyk|nerasyk|neberašyk|neberasyk|ištrink|istrink|pašalink|pasalink)\s+(?:kad\s+)?(.+?)(?:\.|$|,|;)/i
  );
  if (banMatch?.[1]) {
    const phrase = banMatch[1].trim();
    if (phrase.length >= 4) {
      const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      if (re.test(next)) {
        next = next.replace(re, " ").replace(/\s{2,}/g, " ").trim();
        removed.push(phrase);
      } else {
        const topic = /trinkel|įvažiav|ivaziav|kiem|fon|asfalt|šaligatv|saligatv/i;
        if (topic.test(lower) || topic.test(phrase)) {
          const sentences = next.split(/(?<=[.!?])\s+/);
          const kept = sentences.filter((s) => !topic.test(s));
          if (kept.length < sentences.length) {
            next = kept.join(" ").trim();
            removed.push("fono / trinkelių aprašymas");
          }
        }
      }
    }
  }
  return { description: next, removed };
}

export const parsePriceFromChatInput = parseDisambiguatedPrice;


/** Alias used by vision / draft merge paths — same hardened parser. */
export const parsePriceFromText = parsePriceFromChatInput;

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
  priceLabel?: string;
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
  const category = coerceListingCategoryForDb(draft.category, {
    title: draft.title,
    description: draft.description,
    fallback: "other",
  });
  return {
    title: draft.title?.trim() || "Naujas skelbimas",
    description: draft.description,
    price: opts?.price ?? draft.price ?? 0,
    ...(draft.priceLabel?.trim()
      ? { priceLabel: draft.priceLabel.trim() }
      : {}),
    // Bind profile/user city when present; never invent Vilnius / Lietuva.
    location: draft.location?.trim() || opts?.userCity?.trim() || "",
    contact: opts?.contact?.trim() || "",
    category,
    confidence: opts?.confidence ?? 0.9,
    attributes: draft.attributes,
    allowPastomatas:
      draft.allowPastomatas === undefined ? undefined : draft.allowPastomatas,
    ...(publicGallery.length ? { orderedImageUrls: publicGallery } : {}),
    ...(listingFlowState ? { listingFlowState } : {}),
  };
}

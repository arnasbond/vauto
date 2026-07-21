import type { AiExtractedListing } from "@/lib/types";
import {
  buildListingDraftUpdateReply,
  draftToPreviewInput,
} from "@/lib/listing-draft-preview";
import {
  sanitizeListingDescription,
  sanitizeListingTitle,
  sanitizeListingUserText,
} from "@/lib/listing-text-sanitize";
import { isListingWorkflowCommand } from "@/lib/listing-workflow-intent";
import {
  isPhotoIntentListingChip,
  isPhotoIntentSearchChip,
} from "@/lib/photo-intent-resolution";
import {
  readAwaitingListingEditField,
  setAwaitingListingEditField,
} from "@/lib/listing-wizard-flow";
import {
  applyParsedContactsToDraft,
  buildListingContactUpdateReply,
  parseListingContactFromText,
  readAwaitingContactField,
  setAwaitingContactField,
  textContainsListingContactSignals,
  type AwaitingContactField,
} from "@/lib/listing-contact-parse";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
/** „2250€“, „2250 eur“, „kaina 2250“, „už 2250“ — with or without currency symbol. */
const PRICE_INLINE_RE =
  /(?:kaina|uz|už|price|eur(?:ais|u|ų)?|€)?\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|eurų|euro)?\b/i;
const PRICE_BARE_IN_SHORT_RE =
  /(?:^|[^\d])(\d{3,7})(?:[.,]\d{1,2})?(?=[^\d]|$)/;
const MANUAL_FILL_RE =
  /pildyti\s+rankiniu\s+b[uū]du|užpildyti\s+lauk(us|ai)\s+(?:žemiau|forma|ranka)|manual\s+form/i;

export interface ListingChatContext {
  hasListingDraft: boolean;
  sellerFlowActive: boolean;
}

export function isManualFillIntent(text: string): boolean {
  return MANUAL_FILL_RE.test(text.trim());
}

export function buildManualFillChatRedirectReply(): string {
  return "Gerai — tęskime pokalbyje. Parašykite kainą, aprašymą ar kitą detalę čia, ir aš paruošiu skelbimą be formų.";
}

/** Standalone price or short listing clarification — never treat as search noise. */
export function isListingConversationInput(
  text: string,
  ctx: ListingChatContext
): boolean {
  if (!ctx.hasListingDraft && !ctx.sellerFlowActive) return false;
  const t = text.trim();
  if (!t) return false;
  if (isListingWorkflowCommand(t)) return false;
  if (textContainsListingContactSignals(t)) return true;
  if (isManualFillIntent(t)) return true;
  if (parsePriceFromChatInput(t) != null) return true;
  if (PRICE_ONLY_RE.test(t)) return true;
  return t.length <= 120;
}

export function parsePriceFromChatInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  if (PRICE_ONLY_RE.test(t)) {
    const raw = t.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n) : null;
  }

  // Prefer amount glued to currency (handles „2250€.“ — € is not a word char).
  const withCurrency = t.match(
    /(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:ų|u|ais)?)/i
  );
  if (withCurrency?.[1]) {
    const n = Number.parseFloat(withCurrency[1].replace(",", "."));
    // Skip years mistaken as prices when followed by seat/model context without €.
    if (Number.isFinite(n) && n > 0) {
      const matched = withCurrency[0];
      if (/€|eur/i.test(matched)) return Math.round(n);
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

  // Short messages: bare 3–7 digit amount (e.g. „2250. Judame prie PrePublish“).
  if (t.length <= 80) {
    const bare = t.match(PRICE_BARE_IN_SHORT_RE);
    if (bare?.[1]) {
      const n = Number.parseInt(bare[1], 10);
      // Ignore years 1900–2099 as prices.
      if (Number.isFinite(n) && n >= 50 && (n < 1900 || n > 2099)) return n;
    }
  }

  return null;
}

/** Apply price/title patch from chat; returns assistant confirmation or null. */
export function tryApplyListingContactCapture(
  text: string,
  aiDraft: AiExtractedListing | null,
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void,
  opts?: { awaitingField?: AwaitingContactField | null }
): string | null {
  if (!aiDraft) return null;

  const awaitingField = opts?.awaitingField ?? readAwaitingContactField();
  const shouldTry =
    awaitingField != null || textContainsListingContactSignals(text);
  if (!shouldTry) return null;

  const parsed = parseListingContactFromText(text, {
    ...(awaitingField ? { prioritizeField: awaitingField } : {}),
  });
  if (!parsed.hasAny) return null;

  const nextDraft = applyParsedContactsToDraft(aiDraft, parsed);
  updateAiDraft({
    location: nextDraft.location,
    contact: nextDraft.contact,
    attributes: nextDraft.attributes,
  });
  setAwaitingContactField(null);
  return buildListingContactUpdateReply(parsed);
}

/** Apply price/title patch from chat; returns assistant confirmation or null. */
export function tryApplyListingChatInput(
  text: string,
  aiDraft: AiExtractedListing | null,
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void
): string | null {
  if (!aiDraft) return null;

  const flow = aiDraft.listingFlowState;

  // Price must apply in ANY stage — never loop „Kokią kainą?“ after user typed it.
  const priceEarly = parsePriceFromChatInput(text);
  if (priceEarly != null) {
    updateAiDraft({ price: priceEarly });
    // When combined with publish intent, let the SM open PrePublish (no chat-only reply).
    if (isListingWorkflowCommand(text) || /\bprepublish\b|\bjudame\b|\bpublikuoj/i.test(text)) {
      return null;
    }
    if (flow === "AWAITING_PHOTOS" || flow === "AWAITING_CONFIRMATION") {
      return buildListingDraftUpdateReply(
        draftToPreviewInput({ ...aiDraft, price: priceEarly }),
        { intro: "Puiku — atnaujinau kainą!" }
      );
    }
  }

  // State machine: never mutate description/title after drafting stage.
  if (flow === "AWAITING_PHOTOS" || flow === "AWAITING_CONFIRMATION") {
    return null;
  }

  if (isListingWorkflowCommand(text)) return null;

  if (isPhotoIntentListingChip(text) || isPhotoIntentSearchChip(text)) return null;

  const awaitingEdit = readAwaitingListingEditField();
  if (awaitingEdit === "price") {
    const price = priceEarly ?? parsePriceFromChatInput(text);
    if (price != null) {
      updateAiDraft({ price });
      setAwaitingListingEditField(null);
      return buildListingDraftUpdateReply(draftToPreviewInput({ ...aiDraft, price }), {
        intro: "✅ Kaina atnaujinta!",
      });
    }
    return null;
  }
  if (awaitingEdit === "description") {
    const trimmed = text.trim();
    if (trimmed.length >= 3) {
      updateAiDraft({ description: trimmed.slice(0, 4000) });
      setAwaitingListingEditField(null);
      return buildListingDraftUpdateReply(
        draftToPreviewInput({ ...aiDraft, description: trimmed }),
        { intro: "✅ Aprašymas atnaujintas!" }
      );
    }
    return null;
  }
  if (awaitingEdit === "category") {
    const trimmed = text.trim();
    if (trimmed.length >= 2) {
      updateAiDraft({ category: trimmed.toLowerCase() as AiExtractedListing["category"] });
      setAwaitingListingEditField(null);
      return `✅ Kategorija atnaujinta: ${trimmed}. Jei viskas tinka — patvirtinkite publikavimą.`;
    }
    return null;
  }

  const contactReply = tryApplyListingContactCapture(text, aiDraft, updateAiDraft);
  if (contactReply) return contactReply;

  if (textContainsListingContactSignals(text)) return null;

  if (isManualFillIntent(text)) {
    return buildManualFillChatRedirectReply();
  }

  if (priceEarly != null) {
    const nextDraft = { ...aiDraft, price: priceEarly };
    return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
      intro: "Puiku — atnaujinau kainą!",
    });
  }

  const trimmed = sanitizeListingUserText(text);
  // Soft affirmations must never be appended into listing description.
  if (/^(tinka|gerai|taip|ok|okay|patvirtinu|publikuoti|publikuok)\.?$/i.test(trimmed)) {
    return null;
  }
  // Agent clarification / chip echoes must never become listing body copy.
  if (
    /nuotraukoje\s+matau|pasirinkite\s+objekt|ar\s+teisingai\s+suprantu|ruošiame\s+skelbimą/i.test(
      trimmed
    )
  ) {
    return null;
  }
  if (
    trimmed.length >= 3 &&
    trimmed.length <= 240 &&
    !isListingWorkflowCommand(text)
  ) {
    const baseDesc = sanitizeListingDescription(aiDraft.description);
    const nextDescription = baseDesc
      ? `${baseDesc}\n${trimmed}`.trim()
      : trimmed;
    const nextTitle = aiDraft.title?.trim()
      ? sanitizeListingTitle(aiDraft.title)
      : sanitizeListingTitle(trimmed);
    const nextDraft: AiExtractedListing = {
      ...aiDraft,
      description: nextDescription.slice(0, 4000),
      title: nextTitle,
    };
    updateAiDraft({
      description: nextDraft.description,
      ...(aiDraft.title?.trim() ? {} : { title: nextTitle }),
    });
    return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
      intro: "Supratau — papildžiau juodraštį pagal jūsų aprašymą!",
    });
  }

  return null;
}

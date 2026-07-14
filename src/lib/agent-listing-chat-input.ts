import type { AiExtractedListing } from "@/lib/types";
import {
  buildListingDraftUpdateReply,
  draftToPreviewInput,
} from "@/lib/listing-draft-preview";
import { isListingWorkflowCommand } from "@/lib/listing-workflow-intent";
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
const PRICE_INLINE_RE = /(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur|eurų|euro)/i;
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
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  const inline = t.match(PRICE_INLINE_RE);
  if (inline?.[1]) {
    const n = Number.parseFloat(inline[1].replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
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

  if (isListingWorkflowCommand(text)) return null;

  const contactReply = tryApplyListingContactCapture(text, aiDraft, updateAiDraft);
  if (contactReply) return contactReply;

  if (textContainsListingContactSignals(text)) return null;

  if (isManualFillIntent(text)) {
    return buildManualFillChatRedirectReply();
  }

  const price = parsePriceFromChatInput(text);
  if (price != null) {
    const nextDraft = { ...aiDraft, price };
    updateAiDraft({ price });
    return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
      intro: "Puiku — atnaujinau kainą!",
    });
  }

  const trimmed = text.trim();
  if (
    trimmed.length >= 3 &&
    trimmed.length <= 240 &&
    !isListingWorkflowCommand(trimmed)
  ) {
    const nextDescription = aiDraft.description?.trim()
      ? `${aiDraft.description.trim()}\n${trimmed}`
      : trimmed;
    const nextTitle = aiDraft.title?.trim() ? aiDraft.title : trimmed.slice(0, 96);
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

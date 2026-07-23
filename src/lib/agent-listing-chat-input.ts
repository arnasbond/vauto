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
import { extractVehicleAttributesFromText, buildVehicleDescriptionFromAttributes } from "@/lib/vehicle-attribute-extract";

const PRICE_ONLY_RE = /^\d{1,7}(?:[.,]\d{1,2})?(?:\s*(?:€|eur|eurų|euro))?$/i;
/** Require currency OR price keyword — never match bare years like 2007. */
const PRICE_EXPLICIT_RE =
  /(?:(?:kaina|uz|už|price)\s*[:=]?\s*(\d{1,7}(?:[.,]\d{1,2})?)|(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:ų|u|ais)?))/i;
const PRICE_BARE_IN_SHORT_RE =
  /(?:^|[^\d])(\d{3,7})(?:[.,]\d{1,2})?(?=[^\d]|$)/;
const MANUAL_FILL_RE =
  /pildyti\s+rankiniu\s+b[uū]du|užpildyti\s+lauk(us|ai)\s+(?:žemiau|forma|ranka)|manual\s+form/i;

function isLikelyVehicleYear(n: number): boolean {
  return Number.isInteger(n) && n >= 1985 && n <= 2026;
}

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

/** Informal LT draft corrections while a sell draft is active. */
const DRAFT_EDIT_SIGNAL_RE =
  /\b(patais|pataisyti|pakeisk|keisk|atnaujink|ištrink|istrink|neberaš|neberasy|nerašyk|nerasyk|neberašyti|neberasyti|pašalink|pasalink|pridėk|pridek|110\s*kw|\d{2,3}\s*kw)\b/i;

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
  if (DRAFT_EDIT_SIGNAL_RE.test(t)) return true;
  // Active draft: treat informal corrections as UPDATE_LISTING_DRAFT (ChatGPT-style).
  if (ctx.hasListingDraft && t.length <= 500) return true;
  return t.length <= 120;
}

/** Remove unwanted description phrases from natural-language edit requests. */
export function applyNaturalLanguageDescriptionEdits(
  description: string,
  userText: string
): { description: string; removed: string[] } {
  let next = description;
  const removed: string[] = [];
  const lower = userText.toLowerCase();

  // „nerasyti kad stovi ant trinkeliu“ / „ištrink …“
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
        // Fuzzy: drop sentences mentioning driveway / paving stones etc.
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

/** Normalize thin spaces / thousand separators so „2 250 €“ and „2.250“ parse reliably. */
function normalizePriceChatText(text: string): string {
  return text
    .trim()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/(\d)[.,\s](\d{3})\b/g, "$1$2")
    .replace(/\s+/g, " ");
}

function parseFinitePrice(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 100_000_000) return null;
  return Math.round(n);
}

export function parsePriceFromChatInput(text: string): number | null {
  const t = normalizePriceChatText(text);
  if (!t) return null;

  // Explicit currency or „kaina/už …“ — always treat as price (even if year-like digits).
  const explicit = t.match(PRICE_EXPLICIT_RE);
  if (explicit) {
    const n = parseFinitePrice(explicit[1] || explicit[2] || "");
    if (n != null) return n;
  }

  // Bare number only — never treat vehicle years as price.
  if (PRICE_ONLY_RE.test(t)) {
    const hasCurrency = /€|eur/i.test(t);
    const n = parseFinitePrice(t.replace(/[^\d.,]/g, ""));
    if (n == null) return null;
    if (!hasCurrency && isLikelyVehicleYear(n)) return null;
    return n;
  }

  // Short messages: bare amount (e.g. „2250. Judame prie PrePublish“) — skip years.
  if (t.length <= 80) {
    const bare = t.match(PRICE_BARE_IN_SHORT_RE);
    if (bare?.[1]) {
      const n = Number.parseInt(bare[1], 10);
      if (Number.isFinite(n) && n >= 50 && !isLikelyVehicleYear(n)) return n;
    }
  }

  return null;
}

/** Alias used by vision / draft merge paths — same hardened parser. */
export const parsePriceFromText = parsePriceFromChatInput;

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

  // Vehicle specs — only for vehicle/transport drafts (never hijack fashion/RE/etc.).
  const vehicleFamily =
    aiDraft.category === "vehicles" || aiDraft.category === "transport";
  const vehicleSpecs = vehicleFamily
    ? extractVehicleAttributesFromText(text)
    : {};
  const hasVehicleSpecs =
    vehicleFamily &&
    Boolean(
      vehicleSpecs.year ||
        vehicleSpecs.engine ||
        vehicleSpecs.fuelType ||
        vehicleSpecs.model ||
        vehicleSpecs.mileage ||
        vehicleSpecs.powerKw
    );
  const priceEarly = parsePriceFromChatInput(text);
  const priceToApply =
    priceEarly != null &&
    !(vehicleSpecs.year && String(priceEarly) === String(vehicleSpecs.year))
      ? priceEarly
      : null;

  if (hasVehicleSpecs) {
    const nextAttrs = {
      ...(aiDraft.attributes ?? {}),
      ...Object.fromEntries(
        Object.entries(vehicleSpecs).filter(([, v]) => Boolean(v))
      ),
    } as Record<string, string>;
    delete nextAttrs.awaitingSpecs;
    const nextDescription = buildVehicleDescriptionFromAttributes(nextAttrs, {
      location: aiDraft.location,
    });
    const nextTitle =
      nextAttrs.make && nextAttrs.model
        ? sanitizeListingTitle(
            `${nextAttrs.make} ${nextAttrs.model}${nextAttrs.year ? ` ${nextAttrs.year}` : ""}`
          )
        : aiDraft.title;
    const nextDraft: AiExtractedListing = {
      ...aiDraft,
      title: nextTitle,
      description: nextDescription,
      attributes: nextAttrs,
      ...(priceToApply != null ? { price: priceToApply } : {}),
    };
    updateAiDraft({
      title: nextDraft.title,
      description: nextDraft.description,
      attributes: nextAttrs,
      ...(priceToApply != null ? { price: priceToApply } : {}),
    });
    const bits = [
      vehicleSpecs.year ? `${vehicleSpecs.year} m.` : "",
      vehicleSpecs.engine ?? "",
      vehicleSpecs.powerKw ? `${vehicleSpecs.powerKw} kW` : "",
      vehicleSpecs.fuelType?.toLowerCase() ?? "",
      vehicleSpecs.model ?? "",
    ].filter(Boolean);
    return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
      intro: `Supratau — atnaujinau juodraštį${bits.length ? ` (${bits.join(", ")})` : ""}.`,
    });
  }

  // Natural-language description edits (remove driveway fluff, etc.) — never "Ne visai supratau".
  if (DRAFT_EDIT_SIGNAL_RE.test(text) || /neberaš|nerasy|ištrink|istrink/i.test(text)) {
    const { description: editedDesc, removed } = applyNaturalLanguageDescriptionEdits(
      sanitizeListingDescription(aiDraft.description),
      text
    );
    if (removed.length || editedDesc !== sanitizeListingDescription(aiDraft.description)) {
      const nextDraft = { ...aiDraft, description: editedDesc.slice(0, 4000) };
      updateAiDraft({ description: nextDraft.description });
      return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
        intro: removed.length
          ? `Supratau — pašalinau iš aprašymo (${removed.join(", ")}) ir atnaujinau juodraštį.`
          : "Supratau — atnaujinau juodraščio aprašymą.",
      });
    }
  }

  // Price must apply in ANY stage — never loop „Kokią kainą?“ after user typed it.
  // Bare price-only turns return null so VautoAgentContext can open PrePublish immediately
  // (no second „Publikuojam“ click).
  if (priceToApply != null) {
    updateAiDraft({ price: priceToApply });
    if (
      isListingWorkflowCommand(text) ||
      /\bprepublish\b|\bjudame\b|\bpublikuoj/i.test(text) ||
      PRICE_ONLY_RE.test(text.trim())
    ) {
      return null;
    }
  }

  // State machine: never mutate free-form description/title after drafting stage.
  if (flow === "AWAITING_PHOTOS" || flow === "AWAITING_CONFIRMATION") {
    return null;
  }

  if (isListingWorkflowCommand(text)) return null;

  if (isPhotoIntentListingChip(text) || isPhotoIntentSearchChip(text)) return null;

  const awaitingEdit = readAwaitingListingEditField();
  if (awaitingEdit === "price") {
    const price = priceToApply ?? parsePriceFromChatInput(text);
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

  if (priceToApply != null) {
    const nextDraft = { ...aiDraft, price: priceToApply };
    return buildListingDraftUpdateReply(draftToPreviewInput(nextDraft), {
      intro: "Puiku — atnaujinau kainą!",
    });
  }

  const trimmed = sanitizeListingUserText(text);
  // Soft affirmations must never be appended into listing description.
  if (/^(tinka|gerai|taip|ok|okay|patvirtinu|publikuoti|publikuok|labas|sveiki)\.?$/i.test(trimmed)) {
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
  // Only append free-form text when it looks like a real draft edit / description add.
  if (
    trimmed.length >= 12 &&
    trimmed.length <= 400 &&
    !isListingWorkflowCommand(text) &&
    (DRAFT_EDIT_SIGNAL_RE.test(trimmed) ||
      /\b(aprašym|aprasym|pridėk|pridek|dar\s+parašyk|papildyk)\b/i.test(trimmed))
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

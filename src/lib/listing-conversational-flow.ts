import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  AWAITING_PHOTOS_PROMPT,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  buildDraftingCompletePhotosPrompt,
} from "@vauto/shared/listing-organism";

/** Slim barrel — only symbols consumed by frontend chat / draft handlers. */
export {
  type ListingFlowState,
  AWAITING_PHOTOS_NUDGE,
  AWAITING_CONFIRMATION_LOCKED,
  LEAN_SELL_GREETING,
  MULTIMODAL_FUSION_CONFIRM,
  POST_VISION_PUBLISH_CHIPS,
  POST_VISION_PUBLISH_GATE,
  PRE_PUBLISH_CARD_INTRO,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  TEXT_DRAFT_READY_CHIPS,
  TEXT_DRAFT_READY_GATE,
  VEHICLE_SPEC_COPY_OFFER,
  buildDraftReadyChatReply,
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  stripStaleChatPromptTails,
  buildVehicleSpecReportMarkdown,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isAmendListingIntent,
  isHeroFlowLocked,
  isPrepareListingIntent,
  isImmediatePublishCommand,
  isPublishReadyIntent,
  isShowDraftPreviewIntent,
  isTextFirstListingIntent,
  isVisionObjectSellChip,
  listingFlowAllowsPhotoUpload,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
  nounFromVisionObjectSellChip,
  resolveLockedListingFlowState,
  shouldBypassPhotosNudge,
  transitionListingFlow,
  buildLeanSellGreeting,
} from "@vauto/shared/listing-organism";

/** Profile-first, consultant tone — never „Trūksta miesto, kainos…“ dump. */
export function buildConversationalMissingPrompt(
  readiness: Pick<
    PrePublishReadiness,
    | "missingAuth"
    | "missingPhoto"
    | "missingCity"
    | "missingPrice"
    | "missingPhone"
  >
): string {
  if (readiness.missingAuth) {
    return "Norint publikuoti, reikia prisijungti — prisijunkite ir tęsime kaip asmeninis brokeris.";
  }
  if (readiness.missingPrice) {
    return "Kokią kainą norėtumėte matyti skelbime? Parašykite sumą eurais arba „Kainos sutartinės“.";
  }
  if (readiness.missingPhone) {
    return PROFILE_PHONE_REQUIRED;
  }
  if (readiness.missingCity) {
    return PROFILE_CITY_REQUIRED;
  }
  if (readiness.missingPhoto) {
    return AWAITING_PHOTOS_PROMPT;
  }
  // Soft AI confirmation — never use as a red validation error toast.
  return "Ar dar ką nors patikslinsime aprašyme, ar judame prie publikavimo?";
}

/** Actionable publish-gate toast; never the soft AI confirmation fallback. */
export function buildPublishValidationToast(
  readiness: Pick<
    PrePublishReadiness,
    | "missingAuth"
    | "missingPhoto"
    | "missingCity"
    | "missingPrice"
    | "missingPhone"
  >,
  opts?: {
    validationIssues?: string[];
    blockMessage?: string;
  }
): { message: string; type: "error" | "info" } {
  if (
    readiness.missingAuth ||
    readiness.missingPrice ||
    readiness.missingPhone ||
    readiness.missingCity ||
    readiness.missingPhoto
  ) {
    return {
      message: buildConversationalMissingPrompt(readiness),
      type: "error",
    };
  }
  const issue = opts?.validationIssues?.find((x) => Boolean(String(x ?? "").trim()));
  if (issue) {
    const normalized = String(issue).trim();
    if (/miest/i.test(normalized)) {
      return { message: PROFILE_CITY_REQUIRED, type: "error" };
    }
    return { message: normalized, type: "error" };
  }
  const block = String(opts?.blockMessage ?? "").trim();
  if (block && block !== buildConversationalMissingPrompt({
    missingAuth: false,
    missingPhoto: false,
    missingCity: false,
    missingPrice: false,
    missingPhone: false,
  })) {
    return { message: block, type: "error" };
  }
  return {
    message: "Nepavyko publikuoti — patikrinkite privalomus laukus.",
    type: "error",
  };
}

export interface DraftConfirmationInput {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}

export function buildDraftConfirmationBubble(draft: DraftConfirmationInput): string {
  return buildDraftingCompletePhotosPrompt(draft);
}

import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import {
  AWAITING_PHOTOS_PROMPT,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  buildDraftingCompletePhotosPrompt,
} from "@vauto/shared/listing-organism";

export {
  LISTING_FLOW_STATES,
  type ListingFlowState,
  type ListingFlowEvent,
  type ListingFlowDispatchResult,
  PRE_PUBLISH_CARD_INTRO,
  AWAITING_PHOTOS_PROMPT,
  AWAITING_PHOTOS_NUDGE,
  POST_VISION_PUBLISH_GATE,
  TEXT_DRAFT_READY_GATE,
  POST_VISION_MORE_PHOTOS_NUDGE,
  POST_VISION_PUBLISH_CHIPS,
  TEXT_DRAFT_READY_CHIPS,
  MULTIMODAL_FUSION_CONFIRM,
  AWAITING_CONFIRMATION_LOCKED,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  isListingFlowState,
  isVisionObjectSellChip,
  nounFromVisionObjectSellChip,
  isPublishReadyIntent,
  isMorePhotosIntent,
  isTextFirstListingIntent,
  isProductDescriptionContext,
  shouldBypassPhotosNudge,
  inferListingFlowState,
  canTransitionListingFlow,
  resolveLockedListingFlowState,
  isHeroFlowLocked,
  transitionListingFlow,
  listingFlowAllowsFieldMutation,
  listingFlowAllowsPhotoUpload,
  listingFlowTreatsTextAsConfirmation,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
  dispatchListingFlowTurn,
  buildDraftingCompletePhotosPrompt,
  buildTextDraftReadyMessage,
  buildPostVisionHeroMessage,
} from "@vauto/shared/listing-organism";

export const LISTING_CONFIRM_CHIP = "✅ Viskas tinka";
export const LISTING_EDIT_CHIP = "✏️ Dar pataisysiu";

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
    return "Kokią kainą norėtumėte matyti skelbime — greitam pardavimui ar maksimaliai vertei? Parašykite sumą eurais.";
  }
  // City / phone only at the end — never a photo hard-block before text draft review.
  if (readiness.missingPhone) {
    return PROFILE_PHONE_REQUIRED;
  }
  if (readiness.missingCity) {
    return PROFILE_CITY_REQUIRED;
  }
  if (readiness.missingPhoto) {
    return AWAITING_PHOTOS_PROMPT;
  }
  return "Ar dar ką nors patikslinsime aprašyme, ar judame prie publikavimo?";
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

export function listingConfirmationQuickReplies(): string[] {
  return [];
}

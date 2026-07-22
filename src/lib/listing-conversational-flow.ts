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
  MULTIMODAL_FUSION_CONFIRM,
  POST_VISION_PUBLISH_CHIPS,
  POST_VISION_PUBLISH_GATE,
  PRE_PUBLISH_CARD_INTRO,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isHeroFlowLocked,
  isVisionObjectSellChip,
  listingFlowAllowsPhotoUpload,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
  nounFromVisionObjectSellChip,
  resolveLockedListingFlowState,
  shouldBypassPhotosNudge,
  transitionListingFlow,
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
    return "Kokią kainą norėtumėte matyti skelbime — greitam pardavimui ar maksimaliai vertei? Parašykite sumą eurais.";
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

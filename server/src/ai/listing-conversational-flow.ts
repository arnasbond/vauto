/** Slim barrel — only symbols consumed by the agent / media / pre-publish paths. */
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
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  buildVehicleSpecReportMarkdown,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isAmendListingIntent,
  isHeroFlowLocked,
  isImmediatePublishCommand,
  isPrepareListingIntent,
  isPublishReadyIntent,
  isVisionObjectSellChip,
  listingFlowAllowsPhotoUpload,
  nounFromVisionObjectSellChip,
  resolveLockedListingFlowState,
  shouldBypassPhotosNudge,
  transitionListingFlow,
} from "../shared/listing-organism.js";

import {
  AWAITING_PHOTOS_PROMPT,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  buildDraftingCompletePhotosPrompt,
} from "../shared/listing-organism.js";

export function buildConversationalMissingPrompt(input: {
  missingAuth?: boolean;
  missingPhoto?: boolean;
  missingCity?: boolean;
  missingPrice?: boolean;
  missingPhone?: boolean;
}): string {
  if (input.missingAuth) {
    return "Norint publikuoti, reikia prisijungti — prisijunkite ir tęsime kaip asmeninis brokeris.";
  }
  if (input.missingPrice) {
    return "Kokią kainą norėtumėte matyti skelbime — greitam pardavimui ar maksimaliai vertei? Parašykite sumą eurais.";
  }
  if (input.missingPhone) {
    return PROFILE_PHONE_REQUIRED;
  }
  if (input.missingCity) {
    return PROFILE_CITY_REQUIRED;
  }
  if (input.missingPhoto) {
    return AWAITING_PHOTOS_PROMPT;
  }
  return "Ar dar ką nors patikslinsime aprašyme, ar judame prie publikavimo?";
}

export function buildDraftConfirmationBubble(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  return buildDraftingCompletePhotosPrompt(draft);
}

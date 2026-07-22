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
} from "../shared/listing-organism.js";

import {
  AWAITING_PHOTOS_PROMPT,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  buildDraftingCompletePhotosPrompt,
} from "../shared/listing-organism.js";

export const LISTING_CONFIRM_CHIP = "✅ Viskas tinka";
export const LISTING_EDIT_CHIP = "✏️ Dar pataisysiu";

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

export function listingConfirmationQuickReplies(): string[] {
  return [];
}

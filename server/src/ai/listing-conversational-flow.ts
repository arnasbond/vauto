export {
  LISTING_FLOW_STATES,
  type ListingFlowState,
  type ListingFlowEvent,
  type ListingFlowDispatchResult,
  PRE_PUBLISH_CARD_INTRO,
  AWAITING_PHOTOS_PROMPT,
  AWAITING_PHOTOS_NUDGE,
  AWAITING_CONFIRMATION_LOCKED,
  PROFILE_CITY_REQUIRED,
  PROFILE_PHONE_REQUIRED,
  isListingFlowState,
  inferListingFlowState,
  canTransitionListingFlow,
  transitionListingFlow,
  listingFlowAllowsFieldMutation,
  listingFlowAllowsPhotoUpload,
  listingFlowTreatsTextAsConfirmation,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
  dispatchListingFlowTurn,
  buildDraftingCompletePhotosPrompt,
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
    return "Norint publikuoti skelbimą, reikia prisijungti — prisijunkite ir tęsime pokalbį.";
  }
  if (input.missingPhoto) {
    return AWAITING_PHOTOS_PROMPT;
  }
  if (input.missingCity) {
    return PROFILE_CITY_REQUIRED;
  }
  if (input.missingPrice) {
    return "Kokią kainą nustatome? Parašykite sumą eurais, pvz. 8500 €.";
  }
  if (input.missingPhone) {
    return PROFILE_PHONE_REQUIRED;
  }
  return "Papildykime dar kelias detales — parašykite, ką norėtumėte patikslinti.";
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

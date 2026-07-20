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
} from "@vauto/shared/listing-organism";

export const LISTING_CONFIRM_CHIP = "✅ Viskas tinka";
export const LISTING_EDIT_CHIP = "✏️ Dar pataisysiu";

/** Profile-first missing prompts — city/phone come from profile, not listing chat fields. */
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
    return "Norint publikuoti skelbimą, reikia prisijungti — prisijunkite ir tęsime pokalbį.";
  }
  if (readiness.missingPhoto) {
    return AWAITING_PHOTOS_PROMPT;
  }
  if (readiness.missingCity) {
    return PROFILE_CITY_REQUIRED;
  }
  if (readiness.missingPrice) {
    return "Kokią kainą nustatome? Parašykite sumą eurais, pvz. 8500 €.";
  }
  if (readiness.missingPhone) {
    return PROFILE_PHONE_REQUIRED;
  }
  return "Papildykime dar kelias detales — parašykite, ką norėtumėte patikslinti.";
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

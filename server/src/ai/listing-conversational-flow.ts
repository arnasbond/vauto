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
  buildDraftReadyChatChips,
  buildDraftReadyChatReply,
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  stripStaleChatPromptTails,
  buildVehicleSpecReportMarkdown,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isAmendListingIntent,
  isGenericListingDraftTitle,
  isHeroFlowLocked,
  isImmediatePublishCommand,
  isPrepareListingIntent,
  isPublishReadyIntent,
  isShowDraftPreviewIntent,
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
import { buildFactConflictQuestion } from "../shared/fact-conflict.js";

export function buildConversationalMissingPrompt(input: {
  missingAuth?: boolean;
  missingPhoto?: boolean;
  missingCity?: boolean;
  missingPrice?: boolean;
  missingPhone?: boolean;
  missingTitle?: boolean;
  missingCategory?: boolean;
  missingCondition?: boolean;
  activeConflict?: import("../shared/fact-conflict.js").ActiveFactConflict | null;
}): string {
  // P0 — question priority parity with the client's canonical missing guide:
  // an open fact conflict is THE most important question, then title →
  // category → condition → auth/contact/city/price per the existing policy.
  if (input.activeConflict) {
    return buildFactConflictQuestion(input.activeConflict);
  }
  if (input.missingAuth) {
    return "Norint publikuoti, reikia prisijungti — prisijunkite ir tęsime kaip asmeninis brokeris.";
  }
  if (input.missingTitle) {
    return "Kokį daiktą parduodate? Parašykite prekės pavadinimą, pvz. „USB klaviatūra“.";
  }
  if (input.missingCategory) {
    return "Kokiai kategorijai priskirti skelbimą? Pvz. Elektronika, Mada, Namai ir buitis, Transportas.";
  }
  if (input.missingCondition) {
    return "Kokia prekės būklė? Pvz. „Nauja“ arba „Naudota“.";
  }
  if (input.missingPrice) {
    return "Kokią kainą norėtumėte matyti skelbime? Parašykite sumą eurais arba „Kainos sutartinės“.";
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

/**
 * VAUTO listing organism — single source of truth for create-flow state machine.
 * Imported by client (`src/lib/...` re-exports) and server (`server/src/...` re-exports).
 */

export const LISTING_FLOW_STATES = {
  DRAFTING_TEXT: "DRAFTING_TEXT",
  AWAITING_PHOTOS: "AWAITING_PHOTOS",
  AWAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
} as const;

export type ListingFlowState =
  (typeof LISTING_FLOW_STATES)[keyof typeof LISTING_FLOW_STATES];

export type ListingFlowEvent =
  | "DRAFT_SAVED"
  | "PHOTOS_SCANNED"
  | "CONFIRMATION_SHOWN"
  | "FLOW_RESET";

const FORWARD: Record<ListingFlowState, ListingFlowState | null> = {
  DRAFTING_TEXT: "AWAITING_PHOTOS",
  AWAITING_PHOTOS: "AWAITING_CONFIRMATION",
  AWAITING_CONFIRMATION: null,
};

const EVENT_TARGET: Record<ListingFlowEvent, ListingFlowState | null> = {
  DRAFT_SAVED: "AWAITING_PHOTOS",
  PHOTOS_SCANNED: "AWAITING_CONFIRMATION",
  CONFIRMATION_SHOWN: "AWAITING_CONFIRMATION",
  FLOW_RESET: null,
};

export const PRE_PUBLISH_CARD_INTRO =
  "Puiku! Žemiau — galutinė skelbimo peržiūra. Jei viskas teisinga, spauskite „Patvirtinti ir publikuoti“.";

export const AWAITING_PHOTOS_PROMPT =
  "Puiku — juodraštis paruoštas. Kontaktai paimti iš jūsų profilio. Dabar įkelkite iki 6 nuotraukų čia pokalbyje — nuskenuosiu vaizdą ir papildysiu aprašymą.";

export const AWAITING_PHOTOS_NUDGE =
  "Šioje stadijoje reikia nuotraukų (iki 6 vnt.). Įkelkite jas čia pokalbyje — tekstas dabar nekeičia aprašymo.";

export const AWAITING_CONFIRMATION_LOCKED =
  "Skelbimas paruoštas patvirtinimui. Tekstas nekeičia aprašymo — peržiūrėkite kortelę žemiau ir spauskite „Patvirtinti ir publikuoti“.";

export const PROFILE_CITY_REQUIRED =
  "Profilyje trūksta miesto — atnaujinkite profilį (ne skelbimo lauką), tada tęsime.";

export const PROFILE_PHONE_REQUIRED =
  "Profilyje trūksta telefono — atnaujinkite profilį, tada galėsite publikuoti.";

export function isListingFlowState(value: unknown): value is ListingFlowState {
  return (
    value === "DRAFTING_TEXT" ||
    value === "AWAITING_PHOTOS" ||
    value === "AWAITING_CONFIRMATION"
  );
}

export function inferListingFlowState(input: {
  listingFlowState?: string | null;
  hasDraft: boolean;
  photoCount: number;
}): ListingFlowState | null {
  if (!input.hasDraft) return null;
  if (isListingFlowState(input.listingFlowState)) return input.listingFlowState;
  if (input.photoCount > 0) return "AWAITING_CONFIRMATION";
  return "AWAITING_PHOTOS";
}

export function canTransitionListingFlow(
  from: ListingFlowState | null,
  to: ListingFlowState | null
): boolean {
  if (to === null) return true;
  if (from === null) return to === "DRAFTING_TEXT" || to === "AWAITING_PHOTOS";
  if (from === to) return true;
  return FORWARD[from] === to;
}

export function transitionListingFlow(
  current: ListingFlowState | null,
  event: ListingFlowEvent
): ListingFlowState | null {
  if (event === "FLOW_RESET") return null;
  const target = EVENT_TARGET[event];
  if (!target) return current;
  if (current === null) {
    if (event === "DRAFT_SAVED") return "AWAITING_PHOTOS";
    return current;
  }
  if (current === target) return current;
  if (!canTransitionListingFlow(current, target)) return current;
  return target;
}

export function listingFlowAllowsFieldMutation(state: ListingFlowState | null): boolean {
  return state === null || state === "DRAFTING_TEXT";
}

export function listingFlowAllowsPhotoUpload(state: ListingFlowState | null): boolean {
  return state === null || state === "DRAFTING_TEXT" || state === "AWAITING_PHOTOS";
}

export function listingFlowTreatsTextAsConfirmation(
  state: ListingFlowState | null
): boolean {
  return state === "AWAITING_CONFIRMATION";
}

export function listingFlowComposerPlaceholder(
  state: ListingFlowState | null
): string | null {
  if (state === "AWAITING_PHOTOS") return "Įkelkite iki 6 nuotraukų…";
  if (state === "AWAITING_CONFIRMATION") {
    return "Spauskite „Patvirtinti ir publikuoti“ ant kortelės";
  }
  return null;
}

export function listingFlowComposerTextLocked(
  state: ListingFlowState | null
): boolean {
  return state === "AWAITING_CONFIRMATION";
}

export type ListingFlowDispatchResult =
  | { kind: "allow_drafting" }
  | { kind: "nudge_photos"; reply: string }
  | { kind: "process_photos" }
  | { kind: "show_confirmation"; reply: string }
  | { kind: "ignore_backward"; reply: string };

export function dispatchListingFlowTurn(input: {
  state: ListingFlowState | null;
  userText: string;
  hasIncomingPhotos: boolean;
  photoCount: number;
}): ListingFlowDispatchResult {
  const state = input.state;
  if (input.hasIncomingPhotos) {
    if (!listingFlowAllowsPhotoUpload(state)) {
      return { kind: "ignore_backward", reply: AWAITING_CONFIRMATION_LOCKED };
    }
    return { kind: "process_photos" };
  }
  if (listingFlowTreatsTextAsConfirmation(state)) {
    return { kind: "show_confirmation", reply: PRE_PUBLISH_CARD_INTRO };
  }
  if (state === "AWAITING_PHOTOS") {
    return { kind: "nudge_photos", reply: AWAITING_PHOTOS_NUDGE };
  }
  return { kind: "allow_drafting" };
}

export function buildDraftingCompletePhotosPrompt(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  const title = draft.title?.trim() || "prekę";
  const price =
    draft.price != null && draft.price > 0 ? `${draft.price} €` : "";
  const loc = draft.location?.trim() || "";
  const bits = [title, price, loc].filter(Boolean).join(" · ");
  return `Išsaugojau juodraštį: ${bits}.\n\n${AWAITING_PHOTOS_PROMPT}`;
}

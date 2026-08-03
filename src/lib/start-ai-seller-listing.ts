import type { AiExtractedListing, UserProfile } from "@/lib/types";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";
import { isUnresolvedListingLocation } from "@/lib/geocoding";
import { normalizeKnownListingCity } from "@/lib/city-resolve";

export type StartAiSellerListingOptions = {
  fashion?: boolean;
};

function seedLocationFromProfile(city?: string | null): string {
  const known = normalizeKnownListingCity(city);
  if (known) return known;
  const raw = String(city ?? "").trim();
  if (!raw || isUnresolvedListingLocation(raw)) return "";
  return raw;
}

/** Seed a lean listing draft for the 4-step AI seller chat (no /add shell). */
export function buildAiSellerListingSeed(
  user: UserProfile,
  options: StartAiSellerListingOptions = {}
): AiExtractedListing {
  const fashion = Boolean(options.fashion);
  const location = seedLocationFromProfile(user.city);
  const base = createManualFallbackDraft({
    location,
    contact: user.phone || "",
  });
  const seeded = applyProfileToListingDraft(
    {
      ...base,
      title: fashion ? "Drabužių skelbimas" : "Naujas skelbimas",
      description: "",
      category: fashion ? "clothing" : base.category,
      listingFlowState: "DRAFTING_TEXT",
      orderedImageUrls: [],
      attributes: {},
      location,
    },
    user,
    true,
    { onlyIfEmpty: true }
  );
  const nextState =
    transitionListingFlow("DRAFTING_TEXT", "DRAFT_SAVED") ?? "AWAITING_PHOTOS";
  const seededLoc = String(seeded.location ?? "").trim();
  return {
    ...seeded,
    location:
      !seededLoc || isUnresolvedListingLocation(seededLoc) ? location : seededLoc,
    category: fashion ? "clothing" : seeded.category,
    listingFlowState: nextState,
    orderedImageUrls: [],
    attributes: {},
  };
}

/**
 * Instant client-side welcome — NEVER send this through the LLM / SSE loop.
 * First API call must wait for real user text or photo upload.
 */
export const STATIC_SELLER_LISTING_WELCOME =
  "Jūsų kontaktai jau paruošti. Įkelkite nuotraukas ar parašykite, ką parduodate — padėsiu su antrašte, rinkos kaina ir Omniva paštomatu!";

export const STATIC_FASHION_LISTING_WELCOME =
  "Jūsų kontaktai jau paruošti. Įkelkite drabužių nuotraukas ar parašykite, ką parduodate — padėsiu su aprašymu, kaina ir paštomato siuntimu!";

/** @deprecated Use STATIC_*_WELCOME for client render — do not sendAgentMessage this. */
export function aiSellerListingGreeting(fashion = false): string {
  return fashion ? STATIC_FASHION_LISTING_WELCOME : STATIC_SELLER_LISTING_WELCOME;
}

export const CHAT_COMPOSER_FOCUS_EVENT = "vauto-chat-composer-focus";

export function requestChatComposerFocus(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_COMPOSER_FOCUS_EVENT));
}

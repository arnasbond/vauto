import type { AiExtractedListing, ListingCategory, UserProfile } from "@/lib/types";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";
import { isUnresolvedListingLocation } from "@/lib/geocoding";
import { normalizeKnownListingCity } from "@/lib/city-resolve";
import {
  CANONICAL_VERTICAL_ATTR_KEY,
  buildCanonicalListingFlowContext,
  buildCanonicalSellerWelcome,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";

export type StartAiSellerListingOptions = {
  fashion?: boolean;
  verticalId?: VerticalId | null;
};

function seedLocationFromProfile(city?: string | null): string {
  const known = normalizeKnownListingCity(city);
  if (known) return known;
  const raw = String(city ?? "").trim();
  if (!raw || isUnresolvedListingLocation(raw)) return "";
  return raw;
}

function asListingCategory(value: string): ListingCategory {
  return value as ListingCategory;
}

/** Seed a lean listing draft for the 4-step AI seller chat (no /add shell). */
export function buildAiSellerListingSeed(
  user: UserProfile,
  options: StartAiSellerListingOptions = {}
): AiExtractedListing {
  const fashion = Boolean(options.fashion);
  const flow =
    !fashion && options.verticalId
      ? buildCanonicalListingFlowContext(options.verticalId)
      : null;
  const location = seedLocationFromProfile(user.city);
  const category: ListingCategory = fashion
    ? "clothing"
    : flow
      ? asListingCategory(flow.listingCategory)
      : "other";
  const base = createManualFallbackDraft({
    location,
    contact: user.phone || "",
    category,
    title: fashion
      ? "Drabužių skelbimas"
      : flow
        ? `${flow.label} — naujas skelbimas`
        : "Naujas skelbimas",
  });
  const seeded = applyProfileToListingDraft(
    {
      ...base,
      title: fashion
        ? "Drabužių skelbimas"
        : flow
          ? `${flow.label} — naujas skelbimas`
          : "Naujas skelbimas",
      description: flow
        ? `Kategorija: ${flow.label}. Aprašykite objektą pokalbyje — AI padeda, jūs tvirtinate.`
        : "",
      category,
      listingFlowState: "DRAFTING_TEXT",
      orderedImageUrls: [],
      attributes: flow
        ? { [CANONICAL_VERTICAL_ATTR_KEY]: flow.verticalId }
        : {},
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
    category,
    listingFlowState: nextState,
    orderedImageUrls: [],
    attributes: {
      ...(seeded.attributes ?? {}),
      ...(flow ? { [CANONICAL_VERTICAL_ATTR_KEY]: flow.verticalId } : {}),
    },
  };
}

/**
 * Instant client-side welcome — NEVER send this through the LLM / SSE loop.
 * First API call must wait for real user text or photo upload.
 */
export const STATIC_SELLER_LISTING_WELCOME =
  "Pasirinkite kategoriją arba aprašykite objektą / prekę laisvai. Nuotrauka nebūtina pirmam žingsniui — padėsiu su antrašte, kaina ir lokacija. Publikuojate jūs.";

export const STATIC_FASHION_LISTING_WELCOME =
  "Jūsų kontaktai jau paruošti. Įkelkite drabužių nuotraukas ar parašykite, ką parduodate — padėsiu su aprašymu, kaina ir paštomato siuntimu!";

export function sellerListingWelcome(options: StartAiSellerListingOptions = {}): string {
  if (options.fashion) return STATIC_FASHION_LISTING_WELCOME;
  if (options.verticalId) return buildCanonicalSellerWelcome(options.verticalId);
  return STATIC_SELLER_LISTING_WELCOME;
}

/** @deprecated Use STATIC_*_WELCOME / sellerListingWelcome for client render — do not sendAgentMessage this. */
export function aiSellerListingGreeting(fashion = false): string {
  return fashion ? STATIC_FASHION_LISTING_WELCOME : STATIC_SELLER_LISTING_WELCOME;
}

export const CHAT_COMPOSER_FOCUS_EVENT = "vauto-chat-composer-focus";

export function requestChatComposerFocus(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_COMPOSER_FOCUS_EVENT));
}

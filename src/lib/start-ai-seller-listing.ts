import type { AiExtractedListing, UserProfile } from "@/lib/types";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";

export type StartAiSellerListingOptions = {
  fashion?: boolean;
};

/** Seed a lean listing draft for the 4-step AI seller chat (no /add shell). */
export function buildAiSellerListingSeed(
  user: UserProfile,
  options: StartAiSellerListingOptions = {}
): AiExtractedListing {
  const fashion = Boolean(options.fashion);
  const base = createManualFallbackDraft({
    location: user.city || "",
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
    },
    user,
    true,
    { onlyIfEmpty: true }
  );
  const nextState =
    transitionListingFlow("DRAFTING_TEXT", "DRAFT_SAVED") ?? "AWAITING_PHOTOS";
  return {
    ...seeded,
    category: fashion ? "clothing" : seeded.category,
    listingFlowState: nextState,
    orderedImageUrls: [],
  };
}

export function aiSellerListingGreeting(fashion = false): string {
  return fashion
    ? "Noriu kelti drabužių skelbimą Spintoje — naudoju profilio kontaktus. Prašau paprašyti nuotraukų."
    : "Noriu kelti skelbimą — naudoju profilio kontaktus. Prašau paprašyti nuotraukų.";
}

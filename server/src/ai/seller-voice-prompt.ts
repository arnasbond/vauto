/**
 * Phase 2B — single highest-value missing-fact question policy.
 *
 * Vertical facts (make, model, mileage, area, size, salary, …) AND the universal
 * publish blockers (`sellerType`, `city`) are selected together inside one
 * deterministic decision (`selectNextQuestion`) — see that module's documented
 * priority contract. `missingFields` (computed upstream by `postNewListing` from
 * the authoritative city/sellerType checks) is the small normalized blocker signal
 * this function passes in; it is never re-derived here. The post-policy fallback
 * below is only reached for a category the policy does not recognize at all.
 */
import { factsFromAttributes, selectNextQuestion } from "./sell/next-question-policy.js";

export function buildSellerContextualVoiceFollowUp(
  category: string,
  attributes: Record<string, string>,
  missingFields: string[]
): string | null {
  const facts = factsFromAttributes(category, attributes, {
    // Only presence matters to the policy — missingFields is already the source of truth for price.
    price: missingFields.includes("price") ? null : 1,
  });
  const blockers = {
    sellerType: { value: missingFields.includes("sellerType") ? undefined : 1 },
    city: { value: missingFields.includes("city") ? undefined : 1 },
  };
  const next = selectNextQuestion({ category, facts, blockers });
  if (next) return next.question;

  // Unreached for any recognized NextQuestionCategory (blockers/price are already
  // covered above) — kept only as a safety net for an unmapped category string.
  if (missingFields.includes("price")) {
    return "Kokią kainą nustatome eurais — norite greitesnio pardavimo ar aukštesnės kainos?";
  }

  if (missingFields.includes("sellerType")) {
    return "Skelbiate kaip privatus asmuo ar kaip įmonė?";
  }

  if (missingFields.includes("city")) {
    return "Kurį miestą rodyti pirkėjams skelbime?";
  }

  return null;
}

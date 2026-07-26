/** Server-side listing safety gate (mirrors client moderateListing). */

import {
  detectToxicLanguage,
  scrubProfanity,
  detectExplicitReplicaClaim,
  REPLICA_HARD_BLOCK_REPLY,
} from "../ai/safety-shield.js";

const BLOCKED_PATTERNS = [
  /ginkl/i,
  /pistolet/i,
  /narkot/i,
  /kokain/i,
  /marihuan/i,
  /pornograf/i,
  /escort/i,
  /seks.*paslaug/i,
];

export interface ListingModerationResult {
  allowed: boolean;
  reason?: string;
  /** Scrubbed title/description when toxic tokens were removed but listing still allowed. */
  title?: string;
  description?: string;
}

export function moderateListingInput(input: {
  title: string;
  description?: string | null;
  location?: string | null;
}): ListingModerationResult {
  const title = String(input.title ?? "");
  const description = String(input.description ?? "");
  const haystack = `${title} ${input.location ?? ""} ${description}`.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        allowed: false,
        reason:
          "Skelbimas neatitinka platformos taisyklių. Prašome pataisyti aprašymą.",
      };
    }
  }

  // Tier-1 authenticity — hard-block only when seller explicitly declares a fake/replica.
  if (
    detectExplicitReplicaClaim(title) ||
    detectExplicitReplicaClaim(description)
  ) {
    return {
      allowed: false,
      reason: REPLICA_HARD_BLOCK_REPLY,
    };
  }

  if (detectToxicLanguage(title) || detectToxicLanguage(description)) {
    return {
      allowed: false,
      reason:
        "Skelbime aptikta netinkama kalba. Prašome pataisyti pavadinimą ar aprašymą.",
    };
  }

  const cleanTitle = scrubProfanity(title);
  const cleanDescription = scrubProfanity(description);

  if (!cleanTitle.trim() || cleanTitle.trim().length < 3) {
    return { allowed: false, reason: "Įveskite aiškesnį pavadinimą." };
  }

  return {
    allowed: true,
    title: cleanTitle,
    description: cleanDescription || description,
  };
}

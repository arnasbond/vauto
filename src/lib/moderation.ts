import type { AiExtractedListing } from "@/lib/types";

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

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

/** Client-side safety check before publish (replace with server AI moderation in prod) */
export function moderateListing(
  draft: AiExtractedListing,
  extraText = ""
): ModerationResult {
  const haystack = `${draft.title} ${draft.location} ${extraText}`.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        allowed: false,
        reason:
          "Skelbimas neatitinka platformos taisyklių. Prašome pataisyti aprašymą.",
      };
    }
  }

  if (!draft.title.trim() || draft.title.length < 3) {
    return { allowed: false, reason: "Įveskite aiškesnį pavadinimą." };
  }

  return { allowed: true };
}

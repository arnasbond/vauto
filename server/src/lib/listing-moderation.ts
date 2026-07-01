/** Server-side listing safety gate (mirrors client moderateListing). */

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
}

export function moderateListingInput(input: {
  title: string;
  description?: string | null;
  location?: string | null;
}): ListingModerationResult {
  const haystack = `${input.title} ${input.location ?? ""} ${input.description ?? ""}`.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        allowed: false,
        reason:
          "Skelbimas neatitinka platformos taisyklių. Prašome pataisyti aprašymą.",
      };
    }
  }

  if (!input.title.trim() || input.title.trim().length < 3) {
    return { allowed: false, reason: "Įveskite aiškesnį pavadinimą." };
  }

  return { allowed: true };
}

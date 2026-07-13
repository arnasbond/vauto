import type { AiExtractedListing } from "@/lib/types";

/** Confirmation flow — conversational only; never emit rigid field summary widgets. */
export function buildPostValidationReport(draft: AiExtractedListing): string {
  const title = draft.title?.trim() || "skelbimą";
  return `Supratau — norite parduoti ${title}. Papasakokite daugiau: kur yra objektas, koks plotas ar charakteristikos, ir kokią kainą norėtumėte? Jei turite nuotraukų — įkelkite jas tiesiai į pokalbio laukelį apačioje.`;
}

export const POST_VALIDATION_QUICK_REPLIES = [
  "Viskas tinka",
  "Pataisyti kainą",
  "Pataisyti kategoriją",
  "Pataisyti aprašymą",
] as const;

export function buildPostValidationQuickReplies(): string[] {
  return [...POST_VALIDATION_QUICK_REPLIES];
}

export function shouldRunPostValidationReport(
  extracted: AiExtractedListing,
  needsClarification: boolean
): boolean {
  void extracted;
  void needsClarification;
  return false;
}

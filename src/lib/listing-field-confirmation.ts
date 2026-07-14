import type { AiExtractedListing } from "@/lib/types";
import {
  buildListingDraftUpdateReply,
  draftToPreviewInput,
} from "@/lib/listing-draft-preview";

/** Confirmation flow — conversational only; never emit rigid field summary widgets. */
export function buildPostValidationReport(draft: AiExtractedListing): string {
  return buildListingDraftUpdateReply(draftToPreviewInput(draft));
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

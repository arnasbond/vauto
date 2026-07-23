/** Shared ChatGPT-style copy — warm, proactive, never dry dead-ends. */

import { buildEmptySearchWishlistMessage } from "@/lib/matching-service";

export function buildEmptySearchBannerMessage(searchQuery?: string): string {
  return buildEmptySearchWishlistMessage(searchQuery);
}

export const CHAT_MESSAGE_SENT_CONFIRMATION =
  "Puiku — žinutė jau pakeliui pas pardavėją! Atsakymą matysite čia.";

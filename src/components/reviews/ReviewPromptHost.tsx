"use client";

import { ReviewModal } from "@/components/reviews/ReviewModal";
import { useVauto } from "@/context/VautoContext";

/** Global host for post-contact review prompts */
export function ReviewPromptHost() {
  const { pendingReview, clearReviewPrompt } = useVauto();

  if (!pendingReview) return null;

  return (
    <ReviewModal
      open
      onClose={clearReviewPrompt}
      listingId={pendingReview.listingId}
      listingTitle={pendingReview.listingTitle}
      sellerId={pendingReview.sellerId}
    />
  );
}

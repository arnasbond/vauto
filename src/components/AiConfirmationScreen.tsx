"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { AdaptiveConfirmation } from "@/components/adaptive-confirmation/AdaptiveConfirmation";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";

/**
 * AI patvirtinimo ekranas — naudoja `sellerStep` + `aiDraft` iš VautoContext
 * (atitinka Gemini `detectedCategory` / `aiExtractedData` / `publishGeneratedListing`).
 */
export function AiConfirmationScreen() {
  const {
    sellerStep,
    aiDraft,
    aiManualFallback,
    sellerPreviewImage,
    sellerVideoUrl,
    sellerUserPrompt,
    sellerInputMode,
    updateSellerMedia,
    updateAiDraft,
    publishListing,
    cancelSellerFlow,
    requestMediaConsent,
  } = useVauto();

  useEffect(() => {
    if (sellerStep === "confirmation" && aiDraft && !aiDraft.attributes) {
      updateAiDraft({ attributes: {} });
    }
  }, [sellerStep, aiDraft, updateAiDraft]);

  if (sellerStep === "published") return <PublishedOverlay />;
  if (sellerStep !== "confirmation" || !aiDraft) return null;

  const handleAttributeChange = (key: string, value: string | string[]) => {
    updateAiDraft({
      attributes: { ...aiDraft.attributes, [key]: value },
    });
  };

  return (
    <AdaptiveConfirmation
      draft={aiDraft}
      previewImage={sellerPreviewImage}
      videoUrl={sellerVideoUrl}
      userPrompt={sellerUserPrompt}
      speakEnabled={sellerInputMode === "voice" || sellerInputMode === "combined"}
      manualFallback={aiManualFallback}
      onUpdate={updateAiDraft}
      onAttributeChange={handleAttributeChange}
      onMediaChange={updateSellerMedia}
      requestMediaConsent={requestMediaConsent}
      onCancel={cancelSellerFlow}
      onPublish={publishListing}
    />
  );
}

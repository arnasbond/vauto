"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { AdaptiveConfirmation } from "@/components/adaptive-confirmation/AdaptiveConfirmation";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { VehicleListingWizard } from "@/components/vehicle/VehicleListingWizard";
import { RealEstateListingWizard } from "@/components/real-estate/RealEstateListingWizard";
import { ClothingListingWizard } from "@/components/clothing/ClothingListingWizard";
import { GeneralListingWizard } from "@/components/general/GeneralListingWizard";
import { JobListingWizard } from "@/components/jobs/JobListingWizard";
import { ServiceListingWizard } from "@/components/services/ServiceListingWizard";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";

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
    showToast,
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

  const isVehicle = listingToAdaptiveKey(aiDraft.category) === "vehicles";
  const isRealEstate = listingToAdaptiveKey(aiDraft.category) === "real_estate";
  const isClothing = listingToAdaptiveKey(aiDraft.category) === "clothing";
  const isUniversal = listingToAdaptiveKey(aiDraft.category) === "universal";
  const isJobs = listingToAdaptiveKey(aiDraft.category) === "jobs";
  const isServices = listingToAdaptiveKey(aiDraft.category) === "services";

  if (isVehicle) {
    return (
      <VehicleListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        videoUrl={sellerVideoUrl}
        manualFallback={aiManualFallback}
        userPrompt={sellerUserPrompt}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
      />
    );
  }

  if (isRealEstate) {
    return (
      <RealEstateListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        videoUrl={sellerVideoUrl}
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

  if (isClothing) {
    return (
      <ClothingListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        manualFallback={aiManualFallback}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        onToast={showToast}
      />
    );
  }

  if (isUniversal) {
    return (
      <GeneralListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        manualFallback={aiManualFallback}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        onToast={showToast}
      />
    );
  }

  if (isJobs) {
    return (
      <JobListingWizard
        draft={aiDraft}
        manualFallback={aiManualFallback}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        onToast={showToast}
      />
    );
  }

  if (isServices) {
    return (
      <ServiceListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        manualFallback={aiManualFallback}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        onToast={showToast}
      />
    );
  }

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

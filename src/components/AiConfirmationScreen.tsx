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
import { ListingWizardPortal } from "@/components/listing/ListingWizardPortal";

export type AiConfirmationMode = "overlay" | "inline-preview" | "inline-full";

/**
 * AI patvirtinimo ekranas — naudoja `sellerStep` + `aiDraft` iš VautoContext
 * (atitinka Gemini `detectedCategory` / `aiExtractedData` / `publishGeneratedListing`).
 */
export function AiConfirmationScreen({
  mode = "overlay",
}: {
  mode?: AiConfirmationMode;
}) {
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
    submitSellerContent,
  } = useVauto();

  useEffect(() => {
    if (sellerStep === "confirmation") {
      window.scrollTo(0, 0);
      document.querySelectorAll(".listing-wizard-overlay").forEach((el) => {
        (el as HTMLElement).scrollTop = 0;
      });
    }
  }, [sellerStep]);

  useEffect(() => {
    if (sellerStep === "confirmation" && aiDraft && !aiDraft.attributes) {
      updateAiDraft({ attributes: {} });
    }
  }, [sellerStep, aiDraft, updateAiDraft]);

  const portalWrap = (node: React.ReactNode) =>
    mode === "overlay" ? <ListingWizardPortal>{node}</ListingWizardPortal> : node;

  if (sellerStep === "published") return portalWrap(<PublishedOverlay />);
  if (sellerStep !== "confirmation" || !aiDraft) return null;

  const handleAttributeChange = (key: string, value: string | string[]) => {
    updateAiDraft({
      attributes: { ...aiDraft.attributes, [key]: value },
    });
  };

  const isVehicle = listingToAdaptiveKey(aiDraft.category) === "vehicles";
  const usePreviewCard =
    mode === "inline-preview" && isVehicle;
  const embedded = mode === "inline-preview" || mode === "inline-full";

  if (usePreviewCard) {
    return portalWrap(
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

  const isRealEstate = listingToAdaptiveKey(aiDraft.category) === "real_estate";
  const isClothing = listingToAdaptiveKey(aiDraft.category) === "clothing";
  const isUniversal = listingToAdaptiveKey(aiDraft.category) === "universal";
  const isJobs = listingToAdaptiveKey(aiDraft.category) === "jobs";
  const isServices = listingToAdaptiveKey(aiDraft.category) === "services";

  if (isVehicle) {
    return portalWrap(
      <VehicleListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        videoUrl={sellerVideoUrl}
        manualFallback={aiManualFallback}
        userPrompt={sellerUserPrompt}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        onPhotoCaptured={(dataUrl) => submitSellerContent({ imageDataUrl: dataUrl })}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        embedded={embedded}
      />
    );
  }

  if (isRealEstate) {
    return portalWrap(
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
    return portalWrap(
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
    return portalWrap(
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
    return portalWrap(
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
    return portalWrap(
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

  return portalWrap(
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

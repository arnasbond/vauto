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
import { WizardCategoryPicker } from "@/components/listing/WizardCategoryPicker";
import { PhotoClarificationPanel } from "@/components/seller/PhotoClarificationPanel";
import { FlowAgentStrip } from "@/components/agent/FlowAgentStrip";

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
    updateSellerMedia,
    updateAiDraft,
    publishListing,
    publishBulkClothingListings,
    cancelSellerFlow,
    requestMediaConsent,
    showToast,
    submitSellerContent,
    user,
    pendingWardrobeBulkItems,
    pendingWardrobeVoice,
    stageWardrobeBulkPreview,
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

  const draft = aiDraft;

  const wrapWithFlowAgent = (
    node: React.ReactNode,
    opts?: { variant?: "default" | "spinta"; category?: typeof draft.category }
  ) =>
    portalWrap(
      <>
        {opts?.variant !== "spinta" && (
          <FlowAgentStrip variant="default" category={opts?.category ?? draft.category} />
        )}
        {node}
      </>
    );

  const wrapWithCategoryPicker = (node: React.ReactNode) =>
    wrapWithFlowAgent(
      <>
        <PhotoClarificationPanel
          draft={draft}
          onSelectChip={(chip) => {
            const label = chip.replace(/^Parduoti\s+/i, "").trim();
            updateAiDraft({
              title: label ? `Parduodamas ${label}` : chip,
              description: chip,
              confidence: Math.max(draft.confidence ?? 0, 0.6),
            });
          }}
        />
        <WizardCategoryPicker
          category={draft.category}
          onChange={(cat) => updateAiDraft({ category: cat })}
        />
        {node}
      </>,
      { category: draft.category }
    );

  const handleAttributeChange = (key: string, value: string | string[]) => {
    updateAiDraft({
      attributes: { [key]: value },
    });
  };

  const isVehicle = listingToAdaptiveKey(aiDraft.category) === "vehicles";
  const embedded = mode === "inline-preview" || mode === "inline-full";

  if (isVehicle) {
    return wrapWithCategoryPicker(
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

  const isRealEstate = listingToAdaptiveKey(aiDraft.category) === "real_estate";
  const isClothing = listingToAdaptiveKey(aiDraft.category) === "clothing";
  const isUniversal = listingToAdaptiveKey(aiDraft.category) === "universal";
  const isJobs = listingToAdaptiveKey(aiDraft.category) === "jobs";
  const isServices = listingToAdaptiveKey(aiDraft.category) === "services";

  if (isRealEstate) {
    return wrapWithCategoryPicker(
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
    return wrapWithFlowAgent(
      <ClothingListingWizard
        draft={aiDraft}
        previewImage={sellerPreviewImage}
        manualFallback={aiManualFallback}
        userName={user.name}
        defaultLocation={user.city || draft.location}
        onUpdate={updateAiDraft}
        onAttributeChange={handleAttributeChange}
        onMediaChange={updateSellerMedia}
        requestMediaConsent={requestMediaConsent}
        onCancel={cancelSellerFlow}
        onPublish={publishListing}
        onPublishBulk={(drafts) => void publishBulkClothingListings(drafts)}
        onStageWardrobeBulk={stageWardrobeBulkPreview}
        onToast={showToast}
        initialWardrobeItems={pendingWardrobeBulkItems ?? undefined}
        initialWardrobeVoice={pendingWardrobeVoice}
      />,
      { variant: "spinta", category: "clothing" }
    );
  }

  if (isUniversal) {
    return wrapWithCategoryPicker(
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
    return wrapWithCategoryPicker(
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
    return wrapWithCategoryPicker(
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

  return wrapWithCategoryPicker(
    <AdaptiveConfirmation
      draft={aiDraft}
      previewImage={sellerPreviewImage}
      videoUrl={sellerVideoUrl}
      userPrompt={sellerUserPrompt}
      speakEnabled={false}
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

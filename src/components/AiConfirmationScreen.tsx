"use client";

import { useEffect, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { UniversalListingWizard } from "@/components/listing/UniversalListingWizard";
import { ListingWizardPortal } from "@/components/listing/ListingWizardPortal";

export type AiConfirmationMode = "overlay" | "inline-preview" | "inline-full";

/**
 * P8 — vienas patvirtinimo ekranas visoms kategorijoms per UniversalListingWizard.
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
    submitSellerContent,
    user,
    pendingWardrobeBulkItems,
    pendingWardrobeVoice,
    stageWardrobeBulkPreview,
  } = useVauto();

  const reconciledDraftRef = useRef<string | null>(null);

  useEffect(() => {
    if (sellerStep === "confirmation") {
      window.scrollTo(0, 0);
      document.querySelectorAll(".listing-wizard-overlay").forEach((el) => {
        (el as HTMLElement).scrollTop = 0;
      });
    }
  }, [sellerStep]);

  useEffect(() => {
    if (sellerStep !== "confirmation" || !aiDraft) {
      reconciledDraftRef.current = null;
      return;
    }
    const fingerprint = `${aiDraft.category}|${JSON.stringify(aiDraft.attributes ?? {})}`;
    if (reconciledDraftRef.current === fingerprint) return;
    reconciledDraftRef.current = fingerprint;
    updateAiDraft({ attributes: { ...(aiDraft.attributes ?? {}) } });
  }, [sellerStep, aiDraft, updateAiDraft]);

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
      attributes: { [key]: value },
    });
  };

  return portalWrap(
    <UniversalListingWizard
      draft={aiDraft}
      previewImage={sellerPreviewImage}
      videoUrl={sellerVideoUrl}
      userPrompt={sellerUserPrompt}
      manualFallback={aiManualFallback}
      userName={user.name}
      userCity={user.city}
      userPhone={user.phone}
      pendingWardrobeBulkItems={pendingWardrobeBulkItems}
      pendingWardrobeVoice={pendingWardrobeVoice}
      onUpdate={updateAiDraft}
      onAttributeChange={handleAttributeChange}
      onMediaChange={updateSellerMedia}
      requestMediaConsent={requestMediaConsent}
      onCancel={cancelSellerFlow}
      onPublish={publishListing}
      onPublishBulk={(drafts) => void publishBulkClothingListings(drafts)}
      onStageWardrobeBulk={stageWardrobeBulkPreview}
      onPhotoCaptured={(dataUrl) => submitSellerContent({ imageDataUrl: dataUrl })}
    />
  );
}

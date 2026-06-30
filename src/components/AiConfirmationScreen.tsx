"use client";

import { useCallback, useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { UniversalListingWizard } from "@/components/listing/UniversalListingWizard";
import { ListingWizardPortal } from "@/components/listing/ListingWizardPortal";
import type { AiExtractedListing } from "@/lib/types";

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
    reprocessConfirmationPhoto,
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

  useEffect(() => {
    if (sellerStep !== "confirmation" || !aiDraft) return;
    if (String(aiDraft.attributes?.sellerType ?? "").trim()) return;
    updateAiDraft({ attributes: { sellerType: "Privatus asmuo" } });
  }, [sellerStep, aiDraft, updateAiDraft]);

  const bindListingPatch = useCallback(
    (patch: Partial<AiExtractedListing>) => {
      updateAiDraft(patch);
    },
    [updateAiDraft]
  );

  const bindAttribute = useCallback(
    (key: string, value: string | string[]) => {
      updateAiDraft({ attributes: { [key]: value } });
    },
    [updateAiDraft]
  );

  const handlePhotoReplaced = useCallback(
    (dataUrl: string) => {
      void reprocessConfirmationPhoto(dataUrl);
    },
    [reprocessConfirmationPhoto]
  );

  const portalWrap = (node: React.ReactNode) =>
    mode === "overlay" ? <ListingWizardPortal>{node}</ListingWizardPortal> : node;

  if (sellerStep === "published") return portalWrap(<PublishedOverlay />);
  if (sellerStep !== "confirmation" || !aiDraft) return null;

  const wizardKey = `${aiDraft.category}|${sellerUserPrompt ?? ""}|${sellerPreviewImage?.slice(0, 48) ?? ""}`;

  return portalWrap(
    <UniversalListingWizard
      key={wizardKey}
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
      onUpdate={bindListingPatch}
      onAttributeChange={bindAttribute}
      onMediaChange={updateSellerMedia}
      requestMediaConsent={requestMediaConsent}
      onCancel={cancelSellerFlow}
      onPublish={publishListing}
      onPublishBulk={(drafts) => void publishBulkClothingListings(drafts)}
      onStageWardrobeBulk={stageWardrobeBulkPreview}
      onPhotoCaptured={handlePhotoReplaced}
    />
  );
}

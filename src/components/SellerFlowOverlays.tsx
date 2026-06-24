"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { VoiceRecorderOverlay } from "@/components/VoiceRecorderOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useZeroUiScreenOptional } from "@/context/ZeroUiScreenContext";
import { usePathname } from "next/navigation";

export function SellerFlowOverlays() {
  const {
    sellerStep,
    completeVoiceRecording,
    cancelVoiceRecording,
  } = useSellerFlow();
  const zeroUi = useZeroUiScreenOptional();
  const pathname = usePathname();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";
  const inlineListingPreview =
    onHome && zeroUi?.currentView === "listing_preview";

  return (
    <>
      {sellerStep === "recording" && (
        <VoiceRecorderOverlay
          onComplete={completeVoiceRecording}
          onCancel={cancelVoiceRecording}
        />
      )}
      <AiProcessingOverlay />
      {!inlineListingPreview && <AiConfirmationScreen mode="overlay" />}
    </>
  );
}

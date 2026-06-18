"use client";

import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { VoiceRecorderOverlay } from "@/components/VoiceRecorderOverlay";
import { useVauto } from "@/context/VautoContext";

export function SellerFlowOverlays() {
  const {
    sellerStep,
    completeVoiceRecording,
    cancelVoiceRecording,
  } = useVauto();

  return (
    <>
      {sellerStep === "recording" && (
        <VoiceRecorderOverlay
          onComplete={completeVoiceRecording}
          onCancel={cancelVoiceRecording}
        />
      )}
      <AiProcessingOverlay />
      <AiConfirmationScreen />
    </>
  );
}

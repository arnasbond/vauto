"use client";

import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { VoiceRecorderOverlay } from "@/components/VoiceRecorderOverlay";
import { useSellerFlow } from "@/context/SellerFlowContext";

export function SellerFlowOverlays() {
  const {
    sellerStep,
    completeVoiceRecording,
    cancelVoiceRecording,
  } = useSellerFlow();

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

"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { useSellerFlow } from "@/context/SellerFlowContext";

export function SellerFlowOverlays() {
  const { sellerStep } = useSellerFlow();
  const showWizard =
    sellerStep === "confirmation" || sellerStep === "published";

  return (
    <SafeAgentActionBoundary label="seller-flow-overlays">
      <AiProcessingOverlay />
      {showWizard && (
        <SafeAgentActionBoundary label="ai-confirmation">
          <AiConfirmationScreen mode="overlay" />
        </SafeAgentActionBoundary>
      )}
    </SafeAgentActionBoundary>
  );
}

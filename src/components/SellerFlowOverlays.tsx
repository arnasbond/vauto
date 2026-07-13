"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { useSellerFlow } from "@/context/SellerFlowContext";

/** Conversation-first: no structural listing wizard overlay on any route. */
export function SellerFlowOverlays() {
  const { sellerStep } = useSellerFlow();

  return (
    <SafeAgentActionBoundary label="seller-flow-overlays">
      {sellerStep === "processing" && <AiProcessingOverlay />}
    </SafeAgentActionBoundary>
  );
}

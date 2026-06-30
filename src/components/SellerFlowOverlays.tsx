"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { FlowAgentComposer } from "@/components/agent/FlowAgentComposer";
import { useVauto } from "@/context/VautoContext";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { shouldShowFlowAgentComposer } from "@/lib/agent-flow-phase";

export function SellerFlowOverlays() {
  const { sellerStep } = useVauto();
  const phase = useAgentFlowPhase();
  const showWizard =
    sellerStep === "confirmation" || sellerStep === "published";
  const showComposer = shouldShowFlowAgentComposer(phase);

  return (
    <SafeAgentActionBoundary label="seller-flow-overlays">
      <AiProcessingOverlay />
      {showWizard && (
        <SafeAgentActionBoundary label="ai-confirmation">
          <AiConfirmationScreen mode="overlay" />
        </SafeAgentActionBoundary>
      )}
      {showComposer && <FlowAgentComposer phase={phase} />}
    </SafeAgentActionBoundary>
  );
}

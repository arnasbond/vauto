"use client";

import { AiProcessingOverlay } from "@/components/AiProcessingOverlay";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { usePathname } from "next/navigation";

export function SellerFlowOverlays() {
  const pathname = usePathname();
  const onAdd =
    pathname === "/add" ||
    pathname === "/add/" ||
    pathname.startsWith("/add/");

  return (
    <SafeAgentActionBoundary label="seller-flow-overlays">
      <AiProcessingOverlay />
      {onAdd && (
        <SafeAgentActionBoundary label="ai-confirmation">
          <AiConfirmationScreen mode="overlay" />
        </SafeAgentActionBoundary>
      )}
    </SafeAgentActionBoundary>
  );
}

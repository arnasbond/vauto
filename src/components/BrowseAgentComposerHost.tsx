"use client";

import { FlowAgentComposer } from "@/components/agent/FlowAgentComposer";
import { useVauto } from "@/context/VautoContext";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { useAiBrowseDockVisible } from "@/hooks/useAiBrowseDockVisible";

/** P7c — bottom AI dock above BottomNav (browse routes + home with active search). */
export function BrowseAgentComposerHost() {
  const { sellerStep } = useVauto();
  const phase = useAgentFlowPhase();
  const visible = useAiBrowseDockVisible();

  if (!visible) return null;

  return <FlowAgentComposer phase={phase} dockMode={sellerStep === "idle"} />;
}

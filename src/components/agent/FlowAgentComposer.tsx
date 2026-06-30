"use client";

import { AiCommandBar } from "@/components/search/AiCommandBar";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";

interface FlowAgentComposerProps {
  phase: AgentFlowPhase;
  className?: string;
  dockMode?: boolean;
}

/** @deprecated Use AiCommandBar via AgentChromeHost — kept for compatibility. */
export function FlowAgentComposer({
  phase,
  className,
  dockMode = false,
}: FlowAgentComposerProps) {
  return (
    <AiCommandBar
      placement={dockMode ? "dock" : "wizard"}
      phase={phase}
      className={className}
      collapsible={!dockMode}
    />
  );
}

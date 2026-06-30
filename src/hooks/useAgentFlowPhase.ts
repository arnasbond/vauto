"use client";

import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  resolveAgentFlowPhase,
  type AgentFlowPhase,
} from "@/lib/agent-flow-phase";

export function useAgentFlowPhase(): AgentFlowPhase {
  const { sellerStep } = useVauto();
  const { open } = useVautoAgent();
  return useMemo(
    () => resolveAgentFlowPhase(sellerStep, { agentSheetOpen: open }),
    [sellerStep, open]
  );
}

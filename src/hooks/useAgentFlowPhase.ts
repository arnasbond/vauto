"use client";

import { useMemo } from "react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  resolveAgentFlowPhase,
  type AgentFlowPhase,
} from "@/lib/agent-flow-phase";

export function useAgentFlowPhase(): AgentFlowPhase {
  const { sellerStep } = useSellerFlow();
  const { open } = useVautoAgent();
  return useMemo(
    () => resolveAgentFlowPhase(sellerStep, { agentSheetOpen: open }),
    [sellerStep, open]
  );
}

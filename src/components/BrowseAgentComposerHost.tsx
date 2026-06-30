"use client";

import { usePathname } from "next/navigation";
import { FlowAgentComposer } from "@/components/agent/FlowAgentComposer";
import { useVauto } from "@/context/VautoContext";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { shouldShowBrowseAgentComposer } from "@/lib/agent-flow-phase";

/** P7c-full — persistent AI composer dock on marketplace browse routes. */
export function BrowseAgentComposerHost() {
  const pathname = usePathname();
  const { sellerStep } = useVauto();
  const phase = useAgentFlowPhase();

  if (!shouldShowBrowseAgentComposer(pathname, sellerStep, phase)) {
    return null;
  }

  return <FlowAgentComposer phase={phase} />;
}

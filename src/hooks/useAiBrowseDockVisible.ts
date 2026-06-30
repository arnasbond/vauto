"use client";

import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { shouldShowBrowseAgentComposer } from "@/lib/agent-flow-phase";

/** True when bottom AI composer dock should render (avoids duplicate hero inputs). */
export function useAiBrowseDockVisible(): boolean {
  const pathname = usePathname();
  const { sellerStep, searchQuery } = useVauto();
  const phase = useAgentFlowPhase();
  const homeHasSearch = searchQuery.trim().length >= 3;
  return shouldShowBrowseAgentComposer(pathname, sellerStep, phase, { homeHasSearch });
}

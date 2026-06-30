"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { resolveShellChrome, type ShellChromeState } from "@/lib/shell-chrome";

export function useShellChrome(): ShellChromeState {
  const pathname = usePathname();
  const { sellerStep, searchQuery } = useVauto();
  const { open: agentSheetOpen } = useVautoAgent();
  const phase = useAgentFlowPhase();

  return useMemo(
    () =>
      resolveShellChrome({
        pathname,
        sellerStep,
        phase,
        searchQuery,
        agentSheetOpen,
      }),
    [pathname, sellerStep, phase, searchQuery, agentSheetOpen]
  );
}

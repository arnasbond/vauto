"use client";

import { AiCommandBar } from "@/components/search/AiCommandBar";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { useShellChrome } from "@/hooks/useShellChrome";

/**
 * P9 — single fixed AI command dock (browse + wizard). BottomNav hidden via shell chrome.
 */
export function AgentChromeHost() {
  const shell = useShellChrome();
  const phase = useAgentFlowPhase();

  if (!shell.showCommandDock) return null;

  return (
    <AiCommandBar
      placement={shell.dockPlacement === "wizard" ? "wizard" : "dock"}
      phase={phase}
    />
  );
}

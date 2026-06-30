"use client";

import { AiCommandBar } from "@/components/search/AiCommandBar";
import { useAgentFlowPhase } from "@/hooks/useAgentFlowPhase";
import { useShellChrome } from "@/hooks/useShellChrome";

/**
 * P10 — collapsible wizard FAB; browse search lives in TopAiCommandChrome.
 */
export function AgentChromeHost() {
  const shell = useShellChrome();
  const phase = useAgentFlowPhase();

  if (!shell.showWizardBubble) return null;

  return <AiCommandBar placement="wizard" phase={phase} collapsible />;
}

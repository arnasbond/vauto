"use client";

import { useVautoAgent } from "@/context/VautoAgentContext";
import { agentHasSupervisorReply } from "@/lib/agent-chat-layout";

interface SearchEmptyAssistantBannerProps {
  searchQuery: string;
}

/** Viršutinis asistento blokas — išjungtas kai supervisor jau atsakė. */
export function SearchEmptyAssistantBanner(_props: SearchEmptyAssistantBannerProps) {
  const { messages, busy } = useVautoAgent();

  if (
    busy ||
    agentHasSupervisorReply(messages) ||
    messages.some((m) => m.role === "assistant")
  ) {
    return null;
  }

  return null;
}

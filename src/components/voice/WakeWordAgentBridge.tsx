"use client";

import { useEffect } from "react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import type { WakeWordGeminiAgent } from "@/lib/voice-intent-engine";
import type { MutableRefObject } from "react";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";

/** Registers Gemini agent handlers for wake-word dispatch (WakeWordProvider sits above agent). */
export function WakeWordAgentBridge({
  agentRef,
}: {
  agentRef: MutableRefObject<WakeWordGeminiAgent | null>;
}) {
  const { sendAgentMessage, setOpen } = useVautoAgent();
  const { setSearchQuery } = useVauto();
  const { goToMarketplace } = useZeroUiScreen();

  useEffect(() => {
    agentRef.current = {
      sendAgentMessage,
      setAgentOpen: setOpen,
      syncSearchQuery: (query) => setSearchQuery(sanitizeSpeechTranscript(query)),
      ensureMarketplace: () => goToMarketplace("voice"),
    };
    return () => {
      agentRef.current = null;
    };
  }, [agentRef, sendAgentMessage, setOpen, setSearchQuery, goToMarketplace]);

  return null;
}

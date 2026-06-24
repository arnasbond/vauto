"use client";

import { useEffect } from "react";
import { useVautoAgent } from "@/context/VautoAgentContext";
import type { WakeWordGeminiAgent } from "@/lib/voice-intent-engine";
import type { MutableRefObject } from "react";

/** Registers Gemini agent handlers for wake-word dispatch (WakeWordProvider sits above agent). */
export function WakeWordAgentBridge({
  agentRef,
}: {
  agentRef: MutableRefObject<WakeWordGeminiAgent | null>;
}) {
  const { sendAgentMessage, setOpen } = useVautoAgent();

  useEffect(() => {
    agentRef.current = { sendAgentMessage, setAgentOpen: setOpen };
    return () => {
      agentRef.current = null;
    };
  }, [agentRef, sendAgentMessage, setOpen]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { WakeWordOverlay } from "@/components/voice/WakeWordOverlay";

/** Global wake-word overlay + audio-first body class */
export function WakeWordHost() {
  const { wakeWordPhase, wakeWordStatusText, wakeWordTranscript } = useVauto();

  useEffect(() => {
    const active = wakeWordPhase === "active" || wakeWordPhase === "processing";
    document.body.classList.toggle("vauto-audio-first", active);
    return () => document.body.classList.remove("vauto-audio-first");
  }, [wakeWordPhase]);

  return (
    <WakeWordOverlay
      phase={wakeWordPhase}
      statusText={wakeWordStatusText}
      transcript={wakeWordTranscript}
    />
  );
}

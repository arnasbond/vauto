"use client";

import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import type { WakeWordPhase } from "@/lib/wake-word-types";

interface WakeWordOverlayProps {
  phase: WakeWordPhase;
  statusText?: string;
  transcript?: string;
}

export function WakeWordOverlay({
  phase,
  statusText,
  transcript,
}: WakeWordOverlayProps) {
  if (phase !== "active" && phase !== "processing") return null;

  const isProcessing = phase === "processing";

  return (
    <BuddyVoicePulse
      mode={isProcessing ? "reasoning" : "listening"}
      variant="fullscreen"
      subtitle={transcript}
      statusText={
        statusText ??
        (isProcessing ? "Apdoroju užklausą…" : "VAUTO asistentas klausosi jūsų…")
      }
      hint="Pasakykite pvz. „ar atsirado naujų skelbimų dviratis“ arba „surask man laisvą meistrą“"
    />
  );
}

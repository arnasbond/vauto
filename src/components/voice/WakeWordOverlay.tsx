"use client";

import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
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
    <div
      className="vauto-audio-first fixed inset-0 z-[280] flex items-center justify-center bg-[var(--flux-bg)]/92 backdrop-blur-xl"
      role="dialog"
      aria-live="assertive"
      aria-label="VAUTO asistentas klausosi"
    >
      <div className="wake-neon-pulse pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative mx-6 w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex justify-center">
          <BuddyAvatar state={isProcessing ? "typing" : "listening"} />
        </div>

        <h2 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          VAUTO asistentas klausosi jūsų…
        </h2>

        <p className="mt-3 text-lg text-[var(--vauto-teal)]">
          {statusText ??
            (isProcessing
              ? "Apdoroju užklausą…"
              : "Pasakykite, ko ieškote")}
        </p>

        {transcript && (
          <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-base text-slate-200 ring-1 ring-white/10">
            &ldquo;{transcript}&rdquo;
          </p>
        )}

        <AudioWaveAnimation variant="large" className="mx-auto mt-8 max-w-[200px]" />

        <p className="mt-6 text-sm text-slate-500">
          Pasakykite pvz. &ldquo;ar atsirado naujų skelbimų dviratis&rdquo; arba &ldquo;surask man
          laisvą meistrą&rdquo;
        </p>
      </div>
    </div>
  );
}

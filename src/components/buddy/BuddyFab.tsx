"use client";

import { BuddyVoicePulse, type BuddyPulseMode } from "@/components/buddy/BuddyVoicePulse";

interface BuddyFabProps {
  mode?: BuddyPulseMode;
  className?: string;
}

/** Persistent lower-right buddy bubble after AI extraction completes. */
export function BuddyFab({ mode = "speaking", className }: BuddyFabProps) {
  return (
    <div
      className={`pointer-events-none fixed bottom-24 right-4 z-[105] sm:bottom-28 sm:right-6 ${className ?? ""}`}
    >
      <BuddyVoicePulse mode={mode} variant="fab" />
    </div>
  );
}

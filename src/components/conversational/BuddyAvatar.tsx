"use client";

import { Sparkles } from "lucide-react";
import type { BuddyState } from "@/lib/buddy-voice";

interface BuddyAvatarProps {
  state: BuddyState;
}

export function BuddyAvatar({ state }: BuddyAvatarProps) {
  const isActive = state === "typing" || state === "speaking";

  return (
    <div className="relative shrink-0">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[var(--vauto-teal)]/30 to-[var(--flux-indigo)]/30 ring-2 ring-[var(--vauto-teal)]/40 ${
          isActive ? "animate-pulse" : ""
        }`}
      >
        <Sparkles className="h-5 w-5 text-[var(--vauto-teal)]" />
      </div>
      {isActive && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--vauto-orange)] text-[8px] font-bold text-white">
          {state === "speaking" ? "🔊" : "…"}
        </span>
      )}
    </div>
  );
}

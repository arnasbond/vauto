"use client";

import { useEffect, useState } from "react";
import {
  getProcessingMilestones,
  logAiSafeguard,
} from "@/lib/ai-safeguards";
import type { SellerInputMode } from "@/lib/types";

interface AiProcessingMilestonesProps {
  mode: SellerInputMode | null;
  active: boolean;
}

export function AiProcessingMilestones({
  mode,
  active,
}: AiProcessingMilestonesProps) {
  const milestones = getProcessingMilestones(mode);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!active) return;

    const started = performance.now();
    logAiSafeguard("processing_start", { mode, milestones: milestones.length });
    setActiveIndex(0);

    const timers = milestones.map((milestone, index) =>
      window.setTimeout(() => {
        setActiveIndex(index);
        logAiSafeguard("processing_milestone", {
          milestone: milestone.label,
          atMs: milestone.atMs,
          elapsedMs: Math.round(performance.now() - started),
        });
      }, milestone.atMs)
    );

    return () => timers.forEach(clearTimeout);
  }, [active, mode, milestones]);

  if (!active) return null;

  return (
    <div className="mt-6 w-full max-w-sm space-y-3" role="status" aria-live="polite">
      {milestones.map((milestone, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <div
            key={milestone.atMs}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
              current
                ? "border-[var(--vauto-teal)]/50 bg-[var(--vauto-teal)]/10 text-white"
                : done
                  ? "border-white/10 bg-white/5 text-white/70"
                  : "border-white/5 bg-transparent text-white/35"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-[var(--vauto-teal)] text-black"
                  : current
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/40"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={current ? "font-medium" : undefined}>
              {milestone.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

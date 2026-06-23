"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import { AiModeBadge } from "@/components/AiModeBadge";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { getProcessingMilestones, logAiSafeguard } from "@/lib/ai-safeguards";
import { logBuddyState } from "@/lib/buddy-voice";

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode, sellerUserPrompt } = useVauto();
  const [aiLabel, setAiLabel] = useState("Apdorojamas įrašas…");
  const [milestoneLabel, setMilestoneLabel] = useState<string | null>(null);

  useEffect(() => {
    if (sellerStep !== "processing") return;
    logBuddyState("typing", { context: "ai_processing", mode: sellerInputMode ?? "upload" });

    const milestones = getProcessingMilestones(sellerInputMode);
    const started = performance.now();
    setMilestoneLabel(milestones[0]?.label ?? null);

    const timers = milestones.map((m) =>
      window.setTimeout(() => {
        setMilestoneLabel(m.label);
        logAiSafeguard("processing_milestone", {
          label: m.label,
          elapsedMs: Math.round(performance.now() - started),
        });
      }, m.atMs)
    );

    void resolveAiModeLabel().then((label) => {
      setAiLabel(
        sellerInputMode === "upload" || sellerInputMode === "combined"
          ? "Analizuojama nuotrauka ir ruošiami laukai"
          : label || "Apdorojamas įrašas ir ruošiami laukai"
      );
    });

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sellerStep, sellerInputMode]);

  if (sellerStep !== "processing") return null;

  return (
    <div className="relative">
      <div className="absolute left-1/2 top-4 z-[230] -translate-x-1/2">
        <AiModeBadge />
      </div>
      <BuddyVoicePulse
        mode="reasoning"
        variant="fullscreen"
        subtitle={sellerUserPrompt ?? undefined}
        statusText={milestoneLabel ?? aiLabel}
        hint={
          sellerInputMode === "upload" || sellerInputMode === "combined"
            ? "Objekto atpažinimas ir laukų ištraukimas"
            : "Balso konvertavimas į tekstą ir kategorijos nustatymas"
        }
      />
    </div>
  );
}

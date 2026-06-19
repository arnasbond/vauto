"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { logBuddyState } from "@/lib/buddy-voice";
import { AiProcessingMilestones } from "@/components/AiProcessingMilestones";

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode } = useVauto();
  const [aiLabel, setAiLabel] = useState("Apdorojamas įrašas…");

  useEffect(() => {
    if (sellerStep !== "processing") return;
    logBuddyState("typing", { context: "ai_processing", mode: sellerInputMode ?? "upload" });

    void resolveAiModeLabel().then((label) => {
      setAiLabel(
        sellerInputMode === "upload"
          ? "Analizuojama nuotrauka ir ruošiami laukai"
          : label || "Apdorojamas įrašas ir ruošiami laukai"
      );
    });
  }, [sellerStep, sellerInputMode]);

  if (sellerStep !== "processing") return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--flux-bg)]/95 backdrop-blur-lg px-6">
      <p className="max-w-xs text-center text-base font-semibold text-white">
        {aiLabel}
      </p>
      <AiProcessingMilestones mode={sellerInputMode} active />
      <p className="mt-6 max-w-xs text-center text-xs text-white/40">
        {sellerInputMode === "upload"
          ? "Objekto atpažinimas ir laukų ištraukimas"
          : "Balso konvertavimas į tekstą ir kategorijos nustatymas"}
      </p>
    </div>
  );
}

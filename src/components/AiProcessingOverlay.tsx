"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { logBuddyState } from "@/lib/buddy-voice";

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode, sellerUserPrompt } = useVauto();
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
    <BuddyVoicePulse
      mode="reasoning"
      variant="fullscreen"
      subtitle={sellerUserPrompt ?? undefined}
      statusText={aiLabel}
      hint={
        sellerInputMode === "upload"
          ? "Objekto atpažinimas ir laukų ištraukimas"
          : "Balso konvertavimas į tekstą ir kategorijos nustatymas"
      }
    />
  );
}

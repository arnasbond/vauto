"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { resolveAiModeLabel } from "@/lib/ai-mode";

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode } = useVauto();
  const [aiLabel, setAiLabel] = useState("VAUTO AI analizuoja jūsų failą...");

  useEffect(() => {
    if (sellerStep !== "processing") return;
    void resolveAiModeLabel().then((label) => {
      setAiLabel(
        sellerInputMode === "upload"
          ? "VAUTO AI analizuoja jūsų nuotrauką..."
          : label || "VAUTO AI analizuoja jūsų įrašą..."
      );
    });
  }, [sellerStep, sellerInputMode]);

  if (sellerStep !== "processing") return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0f172a]/95 backdrop-blur-lg">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--vauto-teal)] border-t-transparent" />
      <p className="mt-4 animate-pulse font-medium text-white/80">{aiLabel}</p>
      <p className="mt-2 max-w-xs px-6 text-center text-xs text-white/40">
        {sellerInputMode === "upload"
          ? "Atpažįstame objektą ir ištraukiame laukus"
          : "Konvertuojame balsą į tekstą ir klasifikuojame kategoriją"}
      </p>
    </div>
  );
}

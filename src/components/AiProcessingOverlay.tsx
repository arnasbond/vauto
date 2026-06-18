"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { resolveAiModeLabel } from "@/lib/ai-mode";

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode } = useVauto();
  const [aiLabel, setAiLabel] = useState("AI analizuoja...");

  useEffect(() => {
    if (sellerStep !== "processing") return;
    void resolveAiModeLabel().then(setAiLabel);
  }, [sellerStep]);

  if (sellerStep !== "processing") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-6 w-full max-w-sm rounded-3xl bg-[#1e293b] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--vauto-teal)]/20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-teal)]" />
        </div>
        <h2 className="text-lg font-semibold text-white">AI analizuoja...</h2>
        <p className="mt-2 text-sm text-slate-400">
          {sellerInputMode === "upload"
            ? "Atpažįstame nuotrauką ir ištraukiame duomenis"
            : "Konvertuojame balsą į tekstą ir analizuojame"}
        </p>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="ai-processing-bar h-full rounded-full bg-[var(--vauto-teal)]" />
        </div>
        <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
          <Sparkles className="h-3 w-3" />
          {aiLabel}
        </p>
      </div>
    </div>
  );
}

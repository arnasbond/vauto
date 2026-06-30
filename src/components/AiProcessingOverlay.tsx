"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import { AiModeBadge } from "@/components/AiModeBadge";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { getProcessingMilestones, logAiSafeguard } from "@/lib/ai-safeguards";
import { logBuddyState } from "@/lib/buddy-voice";

/** S0 — text mode uses a clean spinner; voice/upload keeps BuddyVoicePulse. */
export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode, sellerUserPrompt } = useVauto();
  const [aiLabel, setAiLabel] = useState("Apdorojamas įrašas…");
  const [milestoneLabel, setMilestoneLabel] = useState<string | null>(null);

  const isTextMode = sellerInputMode === "text";
  const isMediaMode =
    sellerInputMode === "upload" || sellerInputMode === "combined";

  useEffect(() => {
    if (sellerStep !== "processing") return;
    if (!isTextMode) {
      logBuddyState("typing", { context: "ai_processing", mode: sellerInputMode ?? "upload" });
    }

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
        isMediaMode
          ? "Analizuojama nuotrauka ir ruošiami laukai"
          : isTextMode
            ? "Analizuoju aprašymą ir ruošiu skelbimo laukus"
            : label || "Apdorojamas įrašas ir ruošiami laukai"
      );
    });

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sellerStep, sellerInputMode, isTextMode, isMediaMode]);

  if (sellerStep !== "processing") return null;

  if (isTextMode) {
    return (
      <div
        className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-[#0b0f17]/85 px-6 backdrop-blur-sm"
        role="status"
        aria-live="polite"
        aria-label="AI analizuoja tekstą"
      >
        <div className="absolute left-1/2 top-6 z-[230] -translate-x-1/2">
          <AiModeBadge />
        </div>
        <Loader2 className="h-10 w-10 animate-spin text-sky-400" aria-hidden />
        <p className="mt-5 max-w-sm text-center text-sm font-medium text-white">
          {milestoneLabel ?? aiLabel}
        </p>
        {sellerUserPrompt?.trim() && (
          <p className="mt-2 max-w-md text-center text-xs text-slate-400 line-clamp-3">
            „{sellerUserPrompt.trim()}“
          </p>
        )}
        <p className="mt-4 text-center text-[11px] text-slate-500">
          Tekstinis režimas — ruošiu skelbimo juodraštį
        </p>
      </div>
    );
  }

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
          isMediaMode
            ? "Objekto atpažinimas ir laukų ištraukimas"
            : "Balso konvertavimas į tekstą ir kategorijos nustatymas"
        }
      />
    </div>
  );
}

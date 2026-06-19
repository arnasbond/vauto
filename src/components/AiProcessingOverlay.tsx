"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { logBuddyState } from "@/lib/buddy-voice";

const BUDDY_PROCESSING_LINES: Record<string, string[]> = {
  upload: [
    "Hmm, graži nuotrauka…",
    "Atpažįstu objektą ir tikrinu detales…",
    "Jau beveik — ruošiu skelbimą jums!",
  ],
  voice: [
    "Klausausi atidžiai…",
    "Supratau — dabar viską sutvarkysiu!",
    "Patikrinu kainą ir vietą Panevėžyje…",
  ],
  text: [
    "Skaitau, ką parašėte…",
    "Jau ieškau geriausios kategorijos…",
    "Beveik paruošta!",
  ],
  combined: [
    "Nuotrauka ir tekstas — puiku!",
    "Sujungiu viską į vieną skelbimą…",
    "Dar akimirką…",
  ],
};

export function AiProcessingOverlay() {
  const { sellerStep, sellerInputMode } = useVauto();
  const [aiLabel, setAiLabel] = useState("VAUTO draugas analizuoja…");
  const [buddyLine, setBuddyLine] = useState(0);

  useEffect(() => {
    if (sellerStep !== "processing") return;
    logBuddyState("typing", { context: "ai_processing", mode: sellerInputMode ?? "upload" });

    void resolveAiModeLabel().then((label) => {
      setAiLabel(
        sellerInputMode === "upload"
          ? "Žiūriu į nuotrauką ir ruošiu skelbimą…"
          : label || "Klausau ir ruošiu skelbimą…"
      );
    });

    const mode = sellerInputMode ?? "upload";
    const lines = BUDDY_PROCESSING_LINES[mode] ?? BUDDY_PROCESSING_LINES.text;
    let idx = 0;
    setBuddyLine(0);

    const interval = setInterval(() => {
      idx = (idx + 1) % lines.length;
      setBuddyLine(idx);
    }, 2200);

    return () => clearInterval(interval);
  }, [sellerStep, sellerInputMode]);

  if (sellerStep !== "processing") return null;

  const mode = sellerInputMode ?? "upload";
  const lines = BUDDY_PROCESSING_LINES[mode] ?? BUDDY_PROCESSING_LINES.text;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--flux-bg)]/95 backdrop-blur-lg px-6">
      <BuddyAvatar state="typing" />
      <p className="mt-5 max-w-xs text-center text-base font-semibold text-white">
        {aiLabel}
      </p>
      <p className="mt-2 max-w-xs animate-pulse text-center text-sm text-[var(--vauto-teal)]">
        {lines[buddyLine]}
      </p>
      <p className="mt-4 max-w-xs text-center text-xs text-white/40">
        {sellerInputMode === "upload"
          ? "Atpažįstame objektą ir ištraukiame laukus"
          : "Konvertuojame balsą į tekstą ir klasifikuojame kategoriją"}
      </p>
    </div>
  );
}

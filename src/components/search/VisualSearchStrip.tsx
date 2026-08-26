"use client";

import { Camera, Loader2, Sparkles, X } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { visualSearchLabel } from "@/lib/visual-search";

export function VisualSearchStrip() {
  const {
    visualSearchProfile,
    visualSearchRefining,
    clearVisualSearch,
    searchInputMode,
  } = useVauto();

  if (!visualSearchProfile || searchInputMode !== "photo") {
    return null;
  }

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-[var(--ds-ai)]/25 bg-[var(--ds-ai-soft)] px-3 py-2.5">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-ai)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[var(--ds-ai-strong)]">
          {visualSearchLabel(visualSearchProfile)}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--vauto-text-muted)]">
          {visualSearchRefining
            ? "AI analizuoja nuotrauką ir lygina su skelbimų vaizdais…"
            : "Rezultatai: vaizdo, semantinis ir AI panašumas."}
        </p>
      </div>
      {visualSearchProfile.source === "photo" && (
        <Camera className="h-4 w-4 shrink-0 text-[var(--ds-ai)]" aria-hidden />
      )}
      {visualSearchRefining && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--ds-ai)]" />
      )}
      <button
        type="button"
        onClick={() => clearVisualSearch()}
        className="shrink-0 rounded-full p-1 text-[var(--vauto-text-muted)] hover:bg-[var(--ds-surface-muted)]"
        aria-label="Išjungti vizualinę paiešką"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

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

  if (!visualSearchProfile || (searchInputMode !== "photo" && searchInputMode !== "voice")) {
    return null;
  }

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] px-3 py-2.5">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1167b1]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#1e40af]">
          {visualSearchLabel(visualSearchProfile)}
        </p>
        <p className="mt-0.5 text-[11px] text-[#6b7280]">
          {visualSearchRefining
            ? "AI tikslina panašumą su skelbimais…"
            : "Rezultatai surikiuoti pagal vizualinį ir semantinį panašumą."}
        </p>
      </div>
      {visualSearchProfile.source === "photo" && (
        <Camera className="h-4 w-4 shrink-0 text-[#1167b1]" aria-hidden />
      )}
      {visualSearchRefining && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1167b1]" />
      )}
      <button
        type="button"
        onClick={() => clearVisualSearch()}
        className="shrink-0 rounded-full p-1 text-[#6b7280] hover:bg-white/80"
        aria-label="Išjungti vizualinę paiešką"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

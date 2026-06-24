"use client";

import { useEffect, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { vehicleSummaryLabel } from "@/lib/vehicle-catalog";

export function ZeroUiListingPreview() {
  const {
    aiDraft,
    sellerStep,
    cancelSellerFlow,
    sellerUserPrompt,
  } = useVauto();
  const { goToMarketplace } = useZeroUiScreen();
  const [fullWizard, setFullWizard] = useState(false);

  useEffect(() => {
    if (sellerStep === "idle" && !aiDraft) {
      goToMarketplace("agent");
    }
  }, [sellerStep, aiDraft, goToMarketplace]);

  const handleBack = () => {
    cancelSellerFlow();
    goToMarketplace("user");
  };

  if (sellerStep !== "confirmation" || !aiDraft) {
    return (
      <ZeroUiScreenChrome subtitle="Ruošiama…" onBack={handleBack}>
        <p className="py-12 text-center text-sm text-[#6b7280]">
          AI paruošia skelbimo juodraštį…
        </p>
      </ZeroUiScreenChrome>
    );
  }

  const isVehicle = listingToAdaptiveKey(aiDraft.category) === "vehicles";
  const vehicleSummary =
    isVehicle && aiDraft.attributes
      ? vehicleSummaryLabel(aiDraft.attributes)
      : aiDraft.title;

  return (
    <ZeroUiScreenChrome
      subtitle={vehicleSummary || "Patvirtinkite AI juodraštį"}
      onBack={handleBack}
    >
      {isVehicle && !fullWizard && (
        <div className="mb-4 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] px-4 py-3">
          <p className="text-sm font-semibold text-[#1e40af]">
            Chameleon peržiūra — AI užpildyti laukai
          </p>
          <p className="mt-1 text-xs text-[#3b82f6]">
            {sellerUserPrompt
              ? `Iš balso: „${sellerUserPrompt.slice(0, 120)}${sellerUserPrompt.length > 120 ? "…" : ""}"`
              : "Patikrinkite markę, modelį ir metus prieš publikuojant."}
          </p>
          <button
            type="button"
            onClick={() => setFullWizard(true)}
            className="mt-3 text-xs font-semibold text-[#1167b1] underline"
          >
            Atidaryti pilną automobilio vedlį →
          </button>
        </div>
      )}

      <div className={fullWizard || !isVehicle ? "" : "max-h-[70vh] overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white shadow-sm"}>
        <AiConfirmationScreen mode={fullWizard ? "inline-full" : "inline-preview"} />
      </div>
    </ZeroUiScreenChrome>
  );
}

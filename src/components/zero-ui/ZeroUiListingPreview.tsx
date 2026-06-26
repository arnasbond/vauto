"use client";

import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { ZeroUiPaymentGate } from "@/components/zero-ui/ZeroUiPaymentGate";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { vehicleSummaryLabel } from "@/lib/vehicle-catalog";

export function ZeroUiListingPreview() {
  const { aiDraft, sellerStep, cancelSellerFlow } = useVauto();
  const { goToMarketplace, pendingMicroPayment, clearMicroPayment, setActiveBoost } =
    useZeroUiScreen();

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
      {pendingMicroPayment ? (
        <ZeroUiPaymentGate
          embedded
          intent={pendingMicroPayment}
          onCancel={clearMicroPayment}
          onSuccess={() => {
            setActiveBoost(true);
            clearMicroPayment();
          }}
        />
      ) : (
        <AiConfirmationScreen mode="inline-full" />
      )}
    </ZeroUiScreenChrome>
  );
}

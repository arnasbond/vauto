"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { ZeroUiPaymentGate } from "@/components/zero-ui/ZeroUiPaymentGate";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { vehicleSummaryLabel } from "@/lib/vehicle-catalog";

const PREVIEW_LOAD_TIMEOUT_MS = 5000;

export function ZeroUiListingPreview() {
  const { aiDraft, sellerStep, cancelSellerFlow, showToast } = useVauto();
  const { goToMarketplace, pendingMicroPayment, clearMicroPayment, setActiveBoost } =
    useZeroUiScreen();
  const loadStartedRef = useRef<number | null>(null);

  useEffect(() => {
    if (sellerStep === "idle" && !aiDraft) {
      goToMarketplace("agent");
    }
  }, [sellerStep, aiDraft, goToMarketplace]);

  useEffect(() => {
    const ready =
      sellerStep === "published" || (sellerStep === "confirmation" && Boolean(aiDraft));
    if (ready) {
      loadStartedRef.current = null;
      return;
    }
    if (sellerStep === "processing") {
      loadStartedRef.current = null;
      return;
    }

    if (loadStartedRef.current === null) {
      loadStartedRef.current = Date.now();
    }

    const elapsed = Date.now() - loadStartedRef.current;
    const remaining = Math.max(0, PREVIEW_LOAD_TIMEOUT_MS - elapsed);

    const timer = window.setTimeout(() => {
      showToast(
        "Per ilgai laukiama — grįžtame į skelbimų formą. Užpildykite laukus ranka.",
        "error"
      );
      cancelSellerFlow();
      goToMarketplace("user");
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [sellerStep, aiDraft, cancelSellerFlow, goToMarketplace, showToast]);

  const handleBack = () => {
    cancelSellerFlow();
    goToMarketplace("user");
  };

  if (sellerStep === "published") {
    return (
      <ZeroUiScreenChrome subtitle="Skelbimas publikuotas" onBack={handleBack}>
        <PublishedOverlay />
      </ZeroUiScreenChrome>
    );
  }

  if (sellerStep === "confirmation" && aiDraft) {
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

  if (sellerStep === "processing") {
    return (
      <ZeroUiScreenChrome subtitle="Analizuojama…" onBack={handleBack}>
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
          <p className="text-center text-sm text-[var(--vauto-text-muted,#94a3b8)]">
            AI analizuoja skelbimo duomenis…
          </p>
        </div>
      </ZeroUiScreenChrome>
    );
  }

  return (
    <ZeroUiScreenChrome subtitle="Ruošiama…" onBack={handleBack}>
      <div className="flex flex-col items-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
        <p className="text-center text-sm text-[var(--vauto-text-muted,#94a3b8)]">
          AI paruošia skelbimo juodraštį…
        </p>
      </div>
    </ZeroUiScreenChrome>
  );
}

"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { ZeroUiPaymentGate } from "@/components/zero-ui/ZeroUiPaymentGate";
import { AiConfirmationScreen } from "@/components/AiConfirmationScreen";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { AI_PROCESSING_TIMEOUT_MS } from "@/lib/ai-safeguards";
import { vehicleSummaryLabel } from "@/lib/vehicle-catalog";
import { apiUpdateListing } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";

const PREVIEW_LOAD_TIMEOUT_MS = 5000;
/** UI safety net — slightly above AI extract ceiling so fallback can fire first */
const PROCESSING_UI_TIMEOUT_MS = AI_PROCESSING_TIMEOUT_MS + 4000;

export function ZeroUiListingPreview() {
  const { aiDraft, sellerStep, cancelSellerFlow, showToast, sellerPreviewImage, listings, user, updateListing } =
    useVauto();
  const { openManualListingWizard } = useSellerFlow();
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
      sellerStep === "published" ||
      (sellerStep === "confirmation" && Boolean(aiDraft));
    if (ready) {
      loadStartedRef.current = null;
      return;
    }

    if (loadStartedRef.current === null) {
      loadStartedRef.current = Date.now();
    }

    const limitMs =
      sellerStep === "processing"
        ? PROCESSING_UI_TIMEOUT_MS
        : PREVIEW_LOAD_TIMEOUT_MS;
    const elapsed = Date.now() - loadStartedRef.current;
    const remaining = Math.max(0, limitMs - elapsed);

    const timer = window.setTimeout(() => {
      if (sellerStep === "processing") {
        showToast(
          "AI analizė užtruko per ilgai — užpildykite skelbimą ranka.",
          "error"
        );
        openManualListingWizard({
          previewImage: sellerPreviewImage,
          toastMessage: "AI analizė užtruko — rankinis vedlys",
        });
        return;
      }

      showToast(
        "Per ilgai laukiama — grįžtame į skelbimų formą. Užpildykite laukus ranka.",
        "error"
      );
      cancelSellerFlow();
      goToMarketplace("user");
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [
    sellerStep,
    aiDraft,
    cancelSellerFlow,
    goToMarketplace,
    showToast,
    openManualListingWizard,
    sellerPreviewImage,
  ]);

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
              const meta = pendingMicroPayment.metadata;
              if (meta?.kind === "ai_twin" && meta.listingId) {
                const listingId = meta.listingId;
                const existingAttrs =
                  listings.find((l) => l.id === listingId)?.attributes ?? {};
                const nextAttrs = { ...existingAttrs, isAiTwinActive: "true" };
                updateListing(listingId, { attributes: nextAttrs });
                if (isDataApiEnabled()) {
                  void apiUpdateListing(listingId, user.id, {
                    attributes: nextAttrs,
                  });
                }
              } else {
                setActiveBoost(true);
              }
              clearMicroPayment();
            }}
          />
        ) : (
          <SafeAgentActionBoundary label="zero-ui-confirmation">
            <AiConfirmationScreen mode="inline-full" />
          </SafeAgentActionBoundary>
        )}
      </ZeroUiScreenChrome>
    );
  }

  if (sellerStep === "processing") {
    return (
      <ZeroUiScreenChrome subtitle="Analizuojama…" onBack={handleBack}>
        <div className="zero-ui-loader-state flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
          <p className="zero-ui-loader-copy text-center text-sm text-[var(--portal-text,var(--vauto-text-main,#111827))]">
            AI analizuoja skelbimo duomenis…
          </p>
        </div>
      </ZeroUiScreenChrome>
    );
  }

  return (
    <ZeroUiScreenChrome subtitle="Ruošiama…" onBack={handleBack}>
      <div className="zero-ui-loader-state flex flex-col items-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
        <p className="zero-ui-loader-copy text-center text-sm text-[var(--portal-text,var(--vauto-text-main,#111827))]">
          AI paruošia skelbimo juodraštį…
        </p>
      </div>
    </ZeroUiScreenChrome>
  );
}

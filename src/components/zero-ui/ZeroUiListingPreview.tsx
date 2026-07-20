"use client";

import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiScreenChrome } from "@/components/zero-ui/ZeroUiScreenChrome";
import { ZeroUiPaymentGate } from "@/components/zero-ui/ZeroUiPaymentGate";
import { SafeAgentActionBoundary } from "@/components/agent/SafeAgentActionBoundary";
import { PublishedOverlay } from "@/components/adaptive-confirmation/ConfirmationShell";
import { apiUpdateListing } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";

/**
 * Zero-UI surface for post-publish celebration and micro-payments only.
 * Listing confirmation lives in the agent (PrePublishListingCard) — never a form wizard.
 */
export function ZeroUiListingPreview() {
  const {
    aiDraft,
    sellerStep,
    cancelSellerFlow,
    listings,
    user,
    updateListing,
  } = useVauto();
  const { setOpen } = useVautoAgent();
  const {
    goToMarketplace,
    pendingMicroPayment,
    clearMicroPayment,
    setActiveBoost,
  } = useZeroUiScreen();

  useEffect(() => {
    if (pendingMicroPayment) return;
    if (sellerStep === "published") return;
    // Any legacy confirmation / idle draft view → marketplace + agent sheet.
    if (sellerStep === "confirmation" || (sellerStep === "idle" && !aiDraft)) {
      if (sellerStep === "confirmation") {
        setOpen(true);
      }
      goToMarketplace("agent");
    }
  }, [sellerStep, aiDraft, goToMarketplace, pendingMicroPayment, setOpen]);

  const handleBack = () => {
    cancelSellerFlow();
    goToMarketplace("user");
  };

  if (pendingMicroPayment) {
    return (
      <ZeroUiScreenChrome subtitle="Mokėjimas" onBack={handleBack}>
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
            goToMarketplace("agent");
          }}
        />
      </ZeroUiScreenChrome>
    );
  }

  if (sellerStep === "published") {
    return (
      <ZeroUiScreenChrome subtitle="Skelbimas publikuotas" onBack={handleBack}>
        <SafeAgentActionBoundary label="zero-ui-published">
          <PublishedOverlay />
        </SafeAgentActionBoundary>
      </ZeroUiScreenChrome>
    );
  }

  if (sellerStep === "processing") {
    return (
      <ZeroUiScreenChrome subtitle="Analizuojama…" onBack={handleBack}>
        <div className="zero-ui-loader-state flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
          <p className="zero-ui-loader-copy text-center text-sm text-[var(--portal-text,var(--vauto-text-main,#111827))]">
            AI analizuoja skelbimo duomenis — tęskite pokalbyje su asistentu…
          </p>
        </div>
      </ZeroUiScreenChrome>
    );
  }

  return (
    <ZeroUiScreenChrome subtitle="Grįžtama…" onBack={handleBack}>
      <div className="zero-ui-loader-state flex flex-col items-center gap-3 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--vauto-primary,#1167b1)]" />
        <p className="zero-ui-loader-copy text-center text-sm text-[var(--portal-text,var(--vauto-text-main,#111827))]">
          Skelbimo patvirtinimas vyksta asistento pokalbyje…
        </p>
      </div>
    </ZeroUiScreenChrome>
  );
}

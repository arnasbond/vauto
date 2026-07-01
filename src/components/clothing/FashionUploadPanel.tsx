"use client";

import { Barcode, Camera, PenLine, Sparkles } from "lucide-react";
import { useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import { interceptPhotoUploadForIntent } from "@/lib/photo-intent-intercept";
import { PHOTO_SEARCH_FALLBACK_MESSAGE } from "@/lib/photo-vision-search";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";

export function FashionUploadPanel() {
  const {
    submitSellerContent,
    sellerStep,
    requestMediaConsent,
    requireAuthForListing,
    user,
    showToast,
  } = useVauto();
  const { sendAgentMessage, applyAgentActions, busy: agentBusy, openWithGreeting } =
    useVautoAgent();
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);

  const busy = (sellerStep !== "idle" && sellerStep !== "published") || agentBusy;

  const openPhotoFlow = () => {
    if (busy) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const openBarcodeFlow = () => {
    if (busy) return;
    if (!requireAuthForListing("/add?vertical=fashion")) return;
    setBarcodeOpen(true);
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    setPhotoSubmitting(true);
    try {
      const handled = await interceptPhotoUploadForIntent(result, {
        userCity: user.city,
        userName: user.name,
        openWithGreeting,
        showToast,
        fallbackMessage: PHOTO_SEARCH_FALLBACK_MESSAGE,
      });
      if (!handled) {
        await submitSellerContent({
          imageDataUrls: result.photos,
          imageDataUrl: result.photos[0],
          extraContext: result.extraContext || undefined,
        });
      }
      setPhotoFlowOpen(false);
      notifyAgentFlow({ kind: "listing_wizard_opened", category: "clothing" });
    } finally {
      setPhotoSubmitting(false);
    }
  };

  return (
    <>
      <div className={`seller-upload-panel${busy ? " pointer-events-none opacity-50" : ""}`}>
        <button
          type="button"
          onClick={openBarcodeFlow}
          disabled={busy}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#7c3aed] bg-[#faf5ff] py-3.5 text-sm font-bold text-[#6d28d9] shadow-sm disabled:opacity-50"
        >
          <Barcode className="h-5 w-5" />
          Skenuoti brūkšninį kodą nuo etiketės
        </button>

        <button
          type="button"
          onClick={openPhotoFlow}
          disabled={busy}
          className="seller-upload-primary-btn mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold shadow-sm disabled:opacity-50"
        >
          <Camera className="h-5 w-5" />
          Įkelti nuotraukas (Spinta AI)
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!requireAuthForListing("/add?vertical=fashion")) return;
            void sendAgentMessage("Padėk užpildyti drabužio skelbimą ranka", {
              fromSearchBar: true,
            }).then((res) => {
              if (res.actions && res.actions.type !== "none") applyAgentActions(res.actions);
            });
          }}
          className="seller-upload-manual-btn mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3.5 text-sm font-bold shadow-sm disabled:opacity-50"
        >
          <PenLine className="h-5 w-5" />
          Užpildyti ranka
        </button>

        <p className="text-center text-sm text-[var(--vauto-text-muted)]">
          <Sparkles className="mr-1 inline h-4 w-4 text-[var(--vauto-primary)]" />
          Nuskenuokite etiketės kodą — AI užpildys prekės ženklą ir paruoš stilingą aprašymą.
        </p>
        <div className="mt-3 flex justify-center">
          <AiModeBadge />
        </div>
      </div>

      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onBarcodeResolved={(code) => void applyScannedBarcode(code, { fashion: true })}
        title="Skenuoti brūkšninį kodą nuo etiketės"
        subtitle="Kvepalai, kosmetika, drabužiai, avalynė — nufotografuokite brūkšninį kodą arba įveskite ranka."
      />

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="intent"
        busy={photoSubmitting}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}

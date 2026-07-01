"use client";

import { ArrowRight, Barcode, Camera, PenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SELLER_CATEGORY_PROMPTS } from "@/lib/seller-category-prompts";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import { QuickImportFromUrlCard } from "@/components/seller/QuickImportFromUrlCard";
import { interceptPhotoUploadForIntent } from "@/lib/photo-intent-intercept";
import { executeConductorRoute, conductorPhotoUploadSource, conductorSearchQuerySource, readConductorSearchExecute, conductorShouldDelegateLegacy } from "@/lib/vauto-conductor";
import type { AiPhotoIntentChoice } from "@/components/photo/AiPhotoFlowSheet";
import { PHOTO_SEARCH_FALLBACK_MESSAGE } from "@/lib/photo-vision-search";
import { UNREGISTERED_PRODUCT_AGENT_PROMPT } from "@/lib/ai-safeguards";
import { unregisteredProductAgentGreetingOptions } from "@/lib/photo-intent-resolution";
import { notifyAgentPendingImages } from "@/lib/vauto-agent-client";

export function SellerUploadPanel({
  autoOpenPhotoFlow = false,
  onPhotoFlowAutoOpened,
}: {
  autoOpenPhotoFlow?: boolean;
  onPhotoFlowAutoOpened?: () => void;
} = {}) {
  const {
    submitSellerContent,
    sellerStep,
    requestMediaConsent,
    openManualListingWizard,
    requireAuthForListing,
    user,
    showToast,
  } = useVauto();
  const { sendAgentMessage, applyAgentActions, busy: agentBusy, openWithGreeting } =
    useVautoAgent();
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const [query, setQuery] = useState("");
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [photoIntentChoice, setPhotoIntentChoice] = useState<AiPhotoIntentChoice | null>(null);
  const pendingPhotoSubmitRef = useRef<AiPhotoFlowResult | null>(null);
  const photoScanTimedOutRef = useRef(false);
  const barcodePhotoContextRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);

  const legacyBusy = sellerStep !== "idle" && sellerStep !== "published";
  const busy = legacyBusy || agentBusy;

  useEffect(() => {
    if (!autoOpenPhotoFlow || autoOpenedRef.current || busy) return;
    autoOpenedRef.current = true;
    requestMediaConsent(() => {
      setPhotoFlowOpen(true);
      onPhotoFlowAutoOpened?.();
    });
  }, [autoOpenPhotoFlow, busy, onPhotoFlowAutoOpened, requestMediaConsent]);

  const runAgentText = useCallback(
    async (text?: string) => {
      const trimmed = text?.trim() ?? query.trim();
      if (!trimmed || busy) return;
      setQuery("");
      const route = await executeConductorRoute({
        ...conductorSearchQuerySource("SellerUploadPanel"),
        payload: { query: trimmed },
      });
      if (!conductorShouldDelegateLegacy(route)) {
        const exec = readConductorSearchExecute(route);
        if (exec?.agentResult.actions && exec.agentResult.actions.type !== "none") {
          applyAgentActions(exec.agentResult.actions);
        }
        return;
      }
      const res = await sendAgentMessage(trimmed, { fromSearchBar: true });
      if (res.actions && res.actions.type !== "none") {
        applyAgentActions(res.actions);
      }
    },
    [applyAgentActions, busy, query, sendAgentMessage]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAgentText();
  };

  const openPhotoFlow = () => {
    if (busy) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handleManualUpload = () => {
    if (!requireAuthForListing("/add")) return;
    setPhotoFlowOpen(false);
    openManualListingWizard({
      toastMessage: "Užpildykite skelbimą rankiniu būdu — be AI analizės.",
      inputMode: "upload",
    });
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    void executeConductorRoute({
      ...conductorPhotoUploadSource("SellerUploadPanel"),
      payload: { photoCount: result.photos.length },
    });
    pendingPhotoSubmitRef.current = result;
    photoScanTimedOutRef.current = false;
    setPhotoSubmitting(true);
    setPhotoIntentChoice(null);
    try {
      const intercept = await interceptPhotoUploadForIntent(
        {
          ...result,
          extraContext: [result.extraContext, query.trim()].filter(Boolean).join("\n"),
        },
        {
          userCity: user.city,
          userName: user.name,
          inlineInSheet: true,
          openWithGreeting,
          showToast,
          fallbackMessage: PHOTO_SEARCH_FALLBACK_MESSAGE,
        }
      );
      if (photoScanTimedOutRef.current) return;
      if (intercept.handled && intercept.inline) {
        setPhotoIntentChoice(intercept.inline);
        return;
      }
      if (!intercept.handled) {
        await submitSellerContent({
          imageDataUrls: result.photos,
          imageDataUrl: result.photos[0],
          extraContext: result.extraContext || undefined,
          text: query.trim() || undefined,
        });
      }
      setQuery("");
      setPhotoFlowOpen(false);
    } finally {
      if (!photoScanTimedOutRef.current) {
        setPhotoSubmitting(false);
        pendingPhotoSubmitRef.current = null;
      }
    }
  };

  const handlePhotoScanTimeout = useCallback(() => {
    if (!photoSubmitting) return;
    const pending = pendingPhotoSubmitRef.current;
    photoScanTimedOutRef.current = true;
    setPhotoSubmitting(false);
    pendingPhotoSubmitRef.current = null;
    setPhotoIntentChoice(null);
    setPhotoFlowOpen(false);
    if (pending?.photos[0]) {
      notifyAgentPendingImages(pending.photos);
      openWithGreeting(
        UNREGISTERED_PRODUCT_AGENT_PROMPT,
        unregisteredProductAgentGreetingOptions()
      );
      void submitSellerContent({
        imageDataUrls: pending.photos,
        imageDataUrl: pending.photos[0],
        extraContext: pending.extraContext || undefined,
        text: query.trim() || undefined,
      });
      setQuery("");
    }
  }, [photoSubmitting, openWithGreeting, submitSellerContent, query]);

  const handlePhotoIntentChip = useCallback(
    (chip: string) => {
      setPhotoIntentChoice(null);
      setPhotoFlowOpen(false);
      setQuery("");
      void sendAgentMessage(chip, { fromSearchBar: true, skipBusyCheck: true });
    },
    [sendAgentMessage]
  );

  const processing = sellerStep === "processing" || agentBusy;

  return (
    <>
      <div
        className={`seller-upload-panel${processing ? " pointer-events-none opacity-50" : ""}`}
      >
        <QuickImportFromUrlCard />
        <button
          type="button"
          onClick={() => {
            if (busy || processing) return;
            if (!requireAuthForListing("/add")) return;
            setBarcodeOpen(true);
          }}
          disabled={busy || processing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#7c3aed] bg-[#faf5ff] py-3.5 text-sm font-bold text-[#6d28d9] shadow-sm disabled:opacity-50"
        >
          <Barcode className="h-5 w-5" />
          📊 Skenuoti brūkšninį / QR kodą
        </button>
        <button
          type="button"
          onClick={openPhotoFlow}
          disabled={busy || processing}
          className="seller-upload-primary-btn mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold shadow-sm disabled:opacity-50"
        >
          <Camera className="h-5 w-5" />
          Skelbti su Vision AI (nuotraukos)
        </button>

        <button
          type="button"
          onClick={handleManualUpload}
          disabled={sellerStep === "published"}
          className="seller-upload-manual-btn mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-3.5 text-sm font-bold shadow-sm disabled:opacity-50"
        >
          <PenLine className="h-5 w-5" />
          Įkelti rankiniu būdu
        </button>

        <p className="mb-4 text-center text-sm text-[var(--vauto-text-muted)]">
          Gemini Vision automatiškai nustato kategoriją, spalvą ir paruošia aprašymą.
          Arba užpildykite formą patys — be AI.
        </p>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SELLER_CATEGORY_PROMPTS.map((item) => (
            <button
              key={item.category}
              type="button"
              disabled={busy || processing}
              onClick={() => {
                setQuery(item.prompt);
                void runAgentText(item.prompt);
              }}
              className="seller-upload-chip shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>

        <form
          className="seller-upload-input-shell flex items-center gap-2 rounded-xl border py-1.5 pl-4 pr-1.5 shadow-sm"
          onSubmit={handleSubmit}
          aria-label="Skelbimo aprašymas"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-[var(--vauto-primary)]" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Pvz. „Parduodu BMW 5500€ Kaune“'
            enterKeyHint="go"
            className="seller-upload-input min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
          />
          <button
            type="submit"
            disabled={busy || processing || !query.trim()}
            aria-label="AI analizuoti aprašymą"
            className="seller-upload-primary-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-2 text-center text-xs text-[var(--vauto-text-muted)]">
          Enter — agentas atpažins kategoriją, užpildys formą ir pasiūlys kainą.
        </p>
      </div>

      {processing && (
        <p className="mt-3 text-center text-sm font-medium text-[var(--vauto-primary)]">
          {agentBusy
            ? "Agentas apdoroja užklausą — neuždarykite šio lango…"
            : "Vision AI apdoroja skelbimą — neuždarykite šio lango…"}
        </p>
      )}

      <div className="mt-2 flex justify-center">
        <AiModeBadge compact />
      </div>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="intent"
        busy={photoSubmitting}
        intentChoice={photoIntentChoice}
        onIntentChip={handlePhotoIntentChip}
        onScanTimeout={handlePhotoScanTimeout}
        onOpenBarcodeScan={({ photos }) => {
          barcodePhotoContextRef.current = photos;
          setBarcodeOpen(true);
        }}
        onClose={() => {
          setPhotoIntentChoice(null);
          setPhotoFlowOpen(false);
        }}
        onSubmit={handlePhotoFlowSubmit}
      />

      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onBarcodeResolved={(code) =>
          void applyScannedBarcode(code, {
            category: "other",
            pendingImageUrls: barcodePhotoContextRef.current,
          })
        }
      />
    </>
  );
}

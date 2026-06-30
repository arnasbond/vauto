"use client";

import { ArrowRight, Camera, PenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SELLER_CATEGORY_PROMPTS } from "@/lib/seller-category-prompts";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import { QuickImportFromUrlCard } from "@/components/seller/QuickImportFromUrlCard";

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
  } = useVauto();
  const { sendAgentMessage, applyAgentActions, busy: agentBusy } = useVautoAgent();
  const [query, setQuery] = useState("");
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
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
    setPhotoSubmitting(true);
    try {
      await submitSellerContent({
        imageDataUrls: result.photos,
        imageDataUrl: result.photos[0],
        extraContext: result.extraContext || undefined,
        text: query.trim() || undefined,
      });
      setQuery("");
      setPhotoFlowOpen(false);
    } finally {
      setPhotoSubmitting(false);
    }
  };

  const processing = sellerStep === "processing" || agentBusy;

  return (
    <>
      <div
        className={`seller-upload-panel${processing ? " pointer-events-none opacity-50" : ""}`}
      >
        <QuickImportFromUrlCard />
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
        mode="listing"
        busy={photoSubmitting}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}

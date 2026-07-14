"use client";

import { ArrowRight, Barcode, Camera, PenLine, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SELLER_CATEGORY_PROMPTS } from "@/lib/seller-category-prompts";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import { QuickImportFromUrlCard } from "@/components/seller/QuickImportFromUrlCard";
import {
  executeConductorRoute,
  conductorPhotoUploadSource,
  conductorSearchQuerySource,
  readConductorSearchExecute,
  conductorShouldDelegateLegacy,
} from "@/lib/vauto-conductor";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";

export function SellerUploadPanel({
  autoOpenPhotoFlow = false,
  onPhotoFlowAutoOpened,
}: {
  autoOpenPhotoFlow?: boolean;
  onPhotoFlowAutoOpened?: () => void;
} = {}) {
  const {
    sellerStep,
    requestMediaConsent,
    openManualListingWizard,
    requireAuthForListing,
  } = useVauto();
  const { sendAgentMessage, applyAgentActions, busy: agentBusy, setOpen } =
    useVautoAgent();
  const router = useRouter();
  const pathname = usePathname();
  const navigateToAgentHome = useCallback(() => {
    const normalized = (pathname || "/").replace(/\/$/, "") || "/";
    if (normalized === "/add") router.push("/");
  }, [pathname, router]);
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const [query, setQuery] = useState("");
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const barcodePhotoContextRef = useRef<string[]>([]);
  const autoOpenedRef = useRef(false);

  const legacyBusy = sellerStep !== "idle" && sellerStep !== "published";
  const busy = legacyBusy || agentBusy;

  useEffect(() => {
    if (!autoOpenPhotoFlow || autoOpenedRef.current || busy) return;
    autoOpenedRef.current = true;
    onPhotoFlowAutoOpened?.();
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      navigateBeforeSend: navigateToAgentHome,
      onBusyChange: setPhotoSubmitting,
    });
  }, [autoOpenPhotoFlow, busy, navigateToAgentHome, onPhotoFlowAutoOpened, requestMediaConsent, sendAgentMessage, setOpen]);

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
      setOpen(true);
      const normalized = (pathname || "/").replace(/\/$/, "") || "/";
      if (normalized === "/add") router.push("/");
      const res = await sendAgentMessage(trimmed, { fromSearchBar: true });
      if (res.actions && res.actions.type !== "none") {
        applyAgentActions(res.actions);
      }
    },
    [applyAgentActions, busy, pathname, query, router, sendAgentMessage, setOpen]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runAgentText();
  };

  const openPhotoUpload = () => {
    if (busy) return;
    void executeConductorRoute({
      ...conductorPhotoUploadSource("SellerUploadPanel"),
      payload: { photoCount: 1 },
    });
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      navigateBeforeSend: navigateToAgentHome,
      text: query.trim() || undefined,
      onBusyChange: (next) => {
        setPhotoSubmitting(next);
        if (!next) setQuery("");
      },
    });
  };

  const handleManualUpload = () => {
    if (!requireAuthForListing("/add")) return;
    openManualListingWizard({
      toastMessage: "Užpildykite skelbimą rankiniu būdu — be AI analizės.",
      inputMode: "upload",
    });
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
          onClick={() => {
            if (busy || processing) return;
            if (!requireAuthForListing("/add")) return;
            setBarcodeOpen(true);
          }}
          disabled={busy || processing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#7c3aed] bg-[#faf5ff] py-3.5 text-sm font-bold text-[#6d28d9] shadow-sm disabled:opacity-50"
        >
          <Barcode className="h-5 w-5" />
          📊 Skenuoti brūkšninį kodą
        </button>
        <button
          type="button"
          onClick={openPhotoUpload}
          disabled={busy || processing || photoSubmitting}
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

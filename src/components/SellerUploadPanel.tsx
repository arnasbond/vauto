"use client";

import { ArrowRight, Camera, Mic, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isVoiceSearchSupported } from "@/lib/voice-search";
import { SELLER_CATEGORY_PROMPTS } from "@/lib/seller-category-prompts";
import { useVauto } from "@/context/VautoContext";
import { AiModeBadge } from "@/components/AiModeBadge";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import {
  VoiceClarifyFlowSheet,
  type VoiceClarifyResult,
} from "@/components/voice/VoiceClarifyFlowSheet";
import { buildVoiceListingExtraContext } from "@/lib/voice-listing-context";
import { QuickImportFromUrlCard } from "@/components/seller/QuickImportFromUrlCard";

export function SellerUploadPanel({
  autoOpenPhotoFlow = false,
  onPhotoFlowAutoOpened,
}: {
  autoOpenPhotoFlow?: boolean;
  onPhotoFlowAutoOpened?: () => void;
} = {}) {
  const { submitSellerContent, sellerStep, requestMediaConsent, showToast, user } =
    useVauto();
  const [query, setQuery] = useState("");
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [voiceFlowOpen, setVoiceFlowOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
  const [voiceSubmitting, setVoiceSubmitting] = useState(false);
  const autoOpenedRef = useRef(false);

  const busy =
    sellerStep !== "idle" && sellerStep !== "published";

  useEffect(() => {
    if (!autoOpenPhotoFlow || autoOpenedRef.current || busy) return;
    autoOpenedRef.current = true;
    requestMediaConsent(() => {
      setPhotoFlowOpen(true);
      onPhotoFlowAutoOpened?.();
    });
  }, [autoOpenPhotoFlow, busy, onPhotoFlowAutoOpened, requestMediaConsent]);

  const runAi = useCallback(
    (text?: string) => {
      const trimmed = text?.trim() ?? query.trim();
      if (!trimmed) return;
      submitSellerContent({ text: trimmed });
      setQuery("");
    },
    [query, submitSellerContent]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAi();
  };

  const handleVoice = () => {
    if (busy || voiceFlowOpen) return;
    if (!isVoiceSearchSupported()) {
      showToast("Ši naršyklė nepalaiko balso įvedimo", "error");
      return;
    }
    requestMediaConsent(() => setVoiceFlowOpen(true));
  };

  const openPhotoFlow = () => {
    if (busy) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
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

  const handleVoiceFlowComplete = async (result: VoiceClarifyResult) => {
    setVoiceSubmitting(true);
    try {
      const userPhoto = result.referenceImages.find((src) => src.startsWith("data:"));
      const extraContext = buildVoiceListingExtraContext({
        mergedTranscript: result.mergedTranscript,
        analysis: result.analysis,
        history: result.history,
      });
      await submitSellerContent({
        text: result.mergedTranscript,
        extraContext,
        imageDataUrl: userPhoto ?? null,
        voiceCapture: true,
      });
      setQuery("");
      setVoiceFlowOpen(false);
    } finally {
      setVoiceSubmitting(false);
    }
  };

  const processing = sellerStep === "processing";

  return (
    <>
      <div className={processing ? "pointer-events-none opacity-50" : undefined}>
      <QuickImportFromUrlCard />
      <button
        type="button"
        onClick={openPhotoFlow}
        disabled={busy || processing}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5a9a]"
      >
        <Camera className="h-5 w-5" />
        Skelbti su AI (nuotraukos)
      </button>

      <button
        type="button"
        onClick={handleVoice}
        disabled={busy || processing || voiceFlowOpen}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff6b00] bg-[#1e293b] py-3.5 text-sm font-semibold text-[#ff6b00] hover:bg-[#334155] disabled:opacity-60"
      >
        <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        Skelbti balsu su AI
      </button>

      <p className="mb-4 text-center text-sm text-slate-400">
        Arba įvesk trumpą aprašymą tekstu.
      </p>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SELLER_CATEGORY_PROMPTS.map((item) => (
          <button
            key={item.category}
            type="button"
            disabled={busy || processing}
            onClick={() => {
              setQuery(item.prompt);
              void submitSellerContent({ text: item.prompt });
            }}
            className="shrink-0 rounded-full border border-slate-600 bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-slate-200 shadow-sm hover:border-[#00f2fe] hover:text-[#00f2fe] disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2 rounded-xl border border-slate-700 bg-[#1e293b] py-1.5 pl-4 pr-1.5 shadow-sm"
        onSubmit={handleSubmit}
        aria-label="Skelbimo aprašymas"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[#00f2fe]" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Pvz. „Parduodu BMW 5500€ Kaune“'
          enterKeyHint="go"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={busy || processing || !query.trim()}
          aria-label="AI analizuoti aprašymą"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1167b1] text-white disabled:opacity-40"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <p className="mt-2 text-center text-xs text-slate-500">
        Enter — AI atpažins kategoriją, užpildys formą ir pasiūlys kainą.
      </p>
      </div>

      {processing && (
        <p className="mt-3 text-center text-sm font-medium text-[#00f2fe]">
          AI apdoroja skelbimą — neuždarykite šio lango…
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

      <VoiceClarifyFlowSheet
        open={voiceFlowOpen}
        mode="listing"
        userCity={user.city || "Lietuva"}
        busy={voiceSubmitting}
        onClose={() => setVoiceFlowOpen(false)}
        onComplete={handleVoiceFlowComplete}
      />
    </>
  );
}

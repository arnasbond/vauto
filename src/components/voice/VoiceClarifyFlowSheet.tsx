"use client";

import { Check, Loader2, Mic, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import { searchReferenceImages } from "@/lib/reference-images";
import {
  analyzeVoiceIntent,
  type VoiceIntentAnalysis,
  type VoiceIntentTurn,
} from "@/lib/voice-intent";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
import {
  isVoiceSearchSupported,
  startVoiceSearch,
  type VoiceSearchSession,
} from "@/lib/voice-search";

export interface VoiceClarifyResult {
  mergedTranscript: string;
  referenceImages: string[];
  analysis: VoiceIntentAnalysis;
  history: VoiceIntentTurn[];
}

type FlowStep = "listen" | "analyze" | "clarify" | "images" | "confirm";

interface VoiceClarifyFlowSheetProps {
  open: boolean;
  mode: "search" | "listing";
  userCity?: string;
  onClose: () => void;
  onComplete: (result: VoiceClarifyResult) => void | Promise<void>;
  busy?: boolean;
}

export function VoiceClarifyFlowSheet({
  open,
  mode,
  userCity = "Lietuva",
  onClose,
  onComplete,
  busy = false,
}: VoiceClarifyFlowSheetProps) {
  const [step, setStep] = useState<FlowStep>("listen");
  const [history, setHistory] = useState<VoiceIntentTurn[]>([]);
  const [analysis, setAnalysis] = useState<VoiceIntentAnalysis | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [liveSubtitle, setLiveSubtitle] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceRef = useRef<VoiceSearchSession | null>(null);
  const startedRef = useRef(false);
  const historyRef = useRef<VoiceIntentTurn[]>([]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const title =
    mode === "search" ? "Balso paieška su AI" : "Skelbti balsu su AI";

  const reset = useCallback(() => {
    voiceRef.current?.cancel();
    voiceRef.current = null;
    stopBuddySpeech();
    setStep("listen");
    setHistory([]);
    setAnalysis(null);
    setReferenceImages([]);
    setLiveSubtitle("");
    setMicReady(false);
    setIsListening(false);
    setError(null);
    startedRef.current = false;
  }, []);

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const processTranscript = useCallback(
    async (transcript: string) => {
      setStep("analyze");
      setError(null);
      const currentHistory = historyRef.current;
      try {
        const result = await analyzeVoiceIntent({
          transcript,
          mode,
          history: currentHistory,
          userCity,
        });

        const nextHistory: VoiceIntentTurn[] = [
          ...currentHistory,
          { role: "user", text: transcript },
        ];

        if (result.needsClarification && result.followUpQuestion) {
          setHistory([
            ...nextHistory,
            { role: "assistant", text: result.followUpQuestion },
          ]);
          setAnalysis(result);
          setStep("clarify");
          speakBuddyMessage(result.followUpQuestion, { enabled: true });
          return;
        }

        setHistory(nextHistory);
        setAnalysis(result);

        const isListing =
          result.intent === "sell" ||
          mode === "listing" ||
          /\bparduod|įdėti\s+skelb|kelti\s+skelb|skelbt/i.test(
            result.mergedTranscript
          );

        if (isListing) {
          setStep("confirm");
          const confirmMsg = `${result.understoodSummary}. Ar teisingai supratau?`;
          speakBuddyMessage(confirmMsg, { enabled: true });
          return;
        }

        setStep("images");

        if (!result.imageSearchQuery?.trim()) {
          setStep("confirm");
          const confirmMsg = `${result.understoodSummary}. Ar teisingai supratau?`;
          speakBuddyMessage(confirmMsg, { enabled: true });
          return;
        }

        const images = await searchReferenceImages(
          result.imageSearchQuery,
          result.category,
          4
        );
        setReferenceImages(images);
        setStep("confirm");

        const confirmMsg = `${result.understoodSummary}. Ar teisingai supratau?`;
        speakBuddyMessage(confirmMsg, { enabled: true });
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Nepavyko apdoroti balso užklausos"
        );
        setStep("listen");
      }
    },
    [mode, userCity]
  );

  const startListening = useCallback(() => {
    if (!isVoiceSearchSupported() || isListening) return;

    setIsListening(true);
    setMicReady(false);
    setLiveSubtitle("");
    setStep((s) => (s === "confirm" ? s : "listen"));

    const session = startVoiceSearch({
      onStart: () => setMicReady(true),
      onInterim: setLiveSubtitle,
      silenceMs: 1_500,
      maxMs: 25_000,
    });
    voiceRef.current = session;

    void session.promise
      .then((text) => {
        const cleaned = text ? sanitizeSpeechTranscript(text.trim()) : null;
        if (cleaned) {
          void processTranscript(cleaned);
        } else if (step !== "confirm") {
          setError("Nepavyko atpažinti balso — bandykite dar kartą");
          setStep("listen");
        }
      })
      .finally(() => {
        voiceRef.current = null;
        setIsListening(false);
        setMicReady(false);
        setLiveSubtitle("");
      });
  }, [isListening, processTranscript, step]);

  useEffect(() => {
    if (!open) return;
    if (startedRef.current) return;
    startedRef.current = true;
    const t = window.setTimeout(() => startListening(), 400);
    return () => window.clearTimeout(t);
  }, [open, startListening]);

  useEffect(() => {
    if (step !== "clarify" || isListening || !open) return;
    const t = window.setTimeout(() => startListening(), 1_500);
    return () => window.clearTimeout(t);
  }, [step, isListening, open, startListening]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleConfirm = async () => {
    if (!analysis || busy) return;
    await onComplete({
      mergedTranscript: analysis.mergedTranscript,
      referenceImages,
      analysis,
      history,
    });
    reset();
  };

  const handleRetry = () => {
    setError(null);
    setStep("listen");
    startListening();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e7eb] px-4 py-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] disabled:opacity-50"
          aria-label="Uždaryti"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-display flex-1 text-center text-base font-bold text-[#111827] pr-9">
          {title}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-32">
        {history.map((turn, i) => (
          <div
            key={`${turn.role}-${i}`}
            className={`mb-3 flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                turn.role === "user"
                  ? "rounded-tr-md bg-[#1167b1] text-white"
                  : "rounded-tl-md bg-[#f3f4f6] text-[#111827]"
              }`}
            >
              {turn.text}
            </div>
          </div>
        ))}

        {(step === "analyze" || step === "images") && (
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-[#1167b1]" />
            <p className="text-sm text-[#6b7280]">
              {step === "analyze"
                ? "Analizuoju, ką pasakėte…"
                : "Ieškau panašių nuotraukų internete…"}
            </p>
          </div>
        )}

        {step === "confirm" && analysis && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <BuddyAvatar state="idle" />
              <div className="flex-1 rounded-2xl rounded-tl-md bg-[#eef6ff] px-4 py-3">
                <p className="text-sm font-medium text-[#111827]">
                  {analysis.understoodSummary}
                </p>
                <p className="mt-2 text-xs text-[#6b7280]">
                  Ar teisingai supratau? Patvirtinkite arba pataisykite.
                </p>
              </div>
            </div>

            {referenceImages.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#6b7280]">
                  Panašios nuotraukos
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {referenceImages.map((src) => (
                    <div
                      key={src}
                      className="aspect-square overflow-hidden rounded-xl border border-[#e5e7eb] bg-[#f9fafb]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt="Panaši prekė"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
            {error}
          </p>
        )}

        {isListening && (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff7ed] text-[#f97316] animate-pulse">
              <Mic className="h-8 w-8" fill="currentColor" strokeWidth={0} />
            </span>
            <p className="text-sm font-semibold text-[#111827]">
              {micReady ? "Klausausi…" : "Jungiamas mikrofonas…"}
            </p>
            {liveSubtitle && (
              <p className="mt-2 max-w-sm text-sm italic text-[#6b7280]">
                {liveSubtitle}
              </p>
            )}
            <button
              type="button"
              onClick={() => voiceRef.current?.stop()}
              className="mt-4 text-sm font-medium text-[#1167b1]"
            >
              Baigti kalbėti
            </button>
          </div>
        )}

        {step === "clarify" && !isListening && (
          <button
            type="button"
            onClick={startListening}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#1167b1] py-3 text-sm font-semibold text-[#1167b1]"
          >
            <Mic className="h-4 w-4" />
            Atsakyti balsu
          </button>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[#e5e7eb] bg-white p-4">
        {step === "confirm" ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={busy}
              className="flex-1 rounded-xl border border-[#d1d5db] py-3.5 text-sm font-semibold text-[#374151] disabled:opacity-50"
            >
              Pataisyti
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {busy ? "Ruošiama…" : "Taip, tęsti"}
            </button>
          </div>
        ) : step === "listen" && !isListening ? (
          <button
            type="button"
            onClick={startListening}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f97316] py-3.5 text-sm font-semibold text-white"
          >
            <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
            Kalbėti
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-[#6b7280]">
            <Sparkles className="h-4 w-4 text-[#1167b1]" />
            AI padės patikslinti ir surasti panašius skelbimus
          </div>
        )}
      </div>
    </div>
  );
}

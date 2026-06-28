"use client";

import { Check, Loader2, Mic, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import { searchReferenceImages } from "@/lib/reference-images";
import {
  analyzeVoiceIntent,
  BUDDY_REPEAT_PROMPT,
  type VoiceIntentAnalysis,
  type VoiceIntentTurn,
} from "@/lib/voice-intent";
import { isUnclearTranscript } from "@/lib/voice-graceful";
import { detectSellerListingIntent, isBuyerSearchIntent } from "@/lib/scoring";
import { sanitizeSpeechTranscript, VOICE_SILENCE_DEBOUNCE_MS } from "@/lib/speech-transcript";
import {
  isVoiceSearchSupported,
  startVoiceSearch,
  type VoiceSearchSession,
} from "@/lib/voice-search";
import {
  ZeroUiVoicePulse,
  type ZeroUiVoicePhase,
} from "@/components/zero-ui/ZeroUiVoicePulse";
import {
  ZeroUiIntentAck,
  type ZeroUiIntentKind,
} from "@/components/zero-ui/ZeroUiIntentAck";
import { useVauto } from "@/context/VautoContext";
import {
  compactMyListingsForAgent,
  resolveAccountTypeLabel,
  summarizeMyListingsSummary,
} from "@/lib/vauto-agent-client";

export interface VoiceClarifyResult {
  mergedTranscript: string;
  referenceImages: string[];
  analysis: VoiceIntentAnalysis;
  history: VoiceIntentTurn[];
}

type FlowStep =
  | "listen"
  | "analyze"
  | "intent_ack"
  | "clarify"
  | "images"
  | "confirm";

const INTENT_ACK_MS = 1_200;
const SILENCE_HOLD_DEBOUNCE_MS = 450;

export type VoiceFlowPhase = ZeroUiVoicePhase | "idle";

interface VoiceClarifyFlowSheetProps {
  open: boolean;
  mode: "search" | "listing";
  userCity?: string;
  onClose: () => void;
  onComplete: (result: VoiceClarifyResult) => void | Promise<void>;
  busy?: boolean;
  onLiveSubtitle?: (text: string) => void;
  onVoicePhase?: (phase: VoiceFlowPhase) => void;
}

function resolveIntentKind(
  result: VoiceIntentAnalysis,
  mode: "search" | "listing"
): ZeroUiIntentKind {
  if (result.needsClarification) return "clarify";
  if (isBuyerSearchIntent(result.mergedTranscript)) return "search";
  if (
    result.intent === "sell" ||
    mode === "listing" ||
    detectSellerListingIntent(result.mergedTranscript)
  ) {
    return "listing";
  }
  return "search";
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function VoiceClarifyFlowSheet({
  open,
  mode,
  userCity = "Lietuva",
  onClose,
  onComplete,
  busy = false,
  onLiveSubtitle,
  onVoicePhase,
}: VoiceClarifyFlowSheetProps) {
  const { user, listings, isAuthenticated } = useVauto();
  const myListingsForAgent = compactMyListingsForAgent(listings, user.id);
  const [step, setStep] = useState<FlowStep>("listen");
  const [history, setHistory] = useState<VoiceIntentTurn[]>([]);
  const [analysis, setAnalysis] = useState<VoiceIntentAnalysis | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [liveSubtitle, setLiveSubtitle] = useState("");
  const [heardTranscript, setHeardTranscript] = useState("");
  const [listenPhase, setListenPhase] = useState<"listening" | "silence_hold">(
    "listening"
  );
  const [micReady, setMicReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voiceRef = useRef<VoiceSearchSession | null>(null);
  const startedRef = useRef(false);
  const historyRef = useRef<VoiceIntentTurn[]>([]);
  const startListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const displaySubtitle = liveSubtitle || heardTranscript;

  const emitSubtitle = useCallback(
    (text: string) => {
      setLiveSubtitle(text);
      onLiveSubtitle?.(text);
    },
    [onLiveSubtitle]
  );

  const emitPhase = useCallback(
    (phase: VoiceFlowPhase) => {
      onVoicePhase?.(phase);
    },
    [onVoicePhase]
  );

  useEffect(() => {
    if (!isListening) {
      setListenPhase("listening");
      return;
    }
    setListenPhase("listening");
    if (!displaySubtitle.trim()) return;
    const timer = window.setTimeout(
      () => setListenPhase("silence_hold"),
      SILENCE_HOLD_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [displaySubtitle, isListening]);

  useEffect(() => {
    if (!open) return;
    if (isListening) {
      emitPhase(listenPhase);
      return;
    }
    if (step === "analyze" || step === "images" || step === "intent_ack") {
      emitPhase("thinking");
      return;
    }
    emitPhase("idle");
  }, [open, isListening, listenPhase, step, emitPhase]);

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
    setHeardTranscript("");
    setListenPhase("listening");
    setMicReady(false);
    setIsListening(false);
    setError(null);
    startedRef.current = false;
    onLiveSubtitle?.("");
    emitPhase("idle");
  }, [emitPhase, onLiveSubtitle]);

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const continueAfterIntentAck = useCallback(
    async (result: VoiceIntentAnalysis, nextHistory: VoiceIntentTurn[]) => {
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
        !isBuyerSearchIntent(result.mergedTranscript) &&
        (result.intent === "sell" ||
          mode === "listing" ||
          detectSellerListingIntent(result.mergedTranscript));

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
    },
    [mode]
  );

  const processTranscript = useCallback(
    async (transcript: string) => {
      if (isUnclearTranscript(transcript)) {
        setError(null);
        setStep("listen");
        speakBuddyMessage(BUDDY_REPEAT_PROMPT, { enabled: true });
        emitPhase("listening");
        window.setTimeout(() => startListeningRef.current?.(), 600);
        return;
      }

      setHeardTranscript(transcript);
      emitSubtitle(transcript);
      setStep("analyze");
      setError(null);
      emitPhase("thinking");

      const currentHistory = historyRef.current;
      try {
        const result = await analyzeVoiceIntent({
          transcript,
          mode,
          history: currentHistory,
          userCity,
          userName: user.name,
          accountType: resolveAccountTypeLabel(user),
          myListingsSummary: summarizeMyListingsSummary(myListingsForAgent, user.name),
          isAuthenticated,
        });

        const nextHistory: VoiceIntentTurn[] = [
          ...currentHistory,
          { role: "user", text: transcript },
        ];

        setAnalysis(result);
        setStep("intent_ack");
        await delay(INTENT_ACK_MS);
        await continueAfterIntentAck(result, nextHistory);
      } catch {
        setError(null);
        setStep("listen");
        speakBuddyMessage(BUDDY_REPEAT_PROMPT, { enabled: true });
        emitPhase("listening");
        window.setTimeout(() => startListeningRef.current?.(), 600);
      }
    },
    [continueAfterIntentAck, emitPhase, emitSubtitle, isAuthenticated, mode, myListingsForAgent, user, userCity]
  );

  const startListening = useCallback(() => {
    if (!isVoiceSearchSupported() || isListening) return;

    setIsListening(true);
    setMicReady(false);
    emitSubtitle("");
    setHeardTranscript("");
    setListenPhase("listening");
    setStep((s) => (s === "confirm" ? s : "listen"));

    const session = startVoiceSearch({
      onStart: () => setMicReady(true),
      onInterim: emitSubtitle,
      silenceMs: VOICE_SILENCE_DEBOUNCE_MS,
      maxMs: 25_000,
    });
    voiceRef.current = session;

    void session.promise
      .then((text) => {
        const cleaned = text ? sanitizeSpeechTranscript(text.trim()) : null;
        if (cleaned && !isUnclearTranscript(cleaned)) {
          setHeardTranscript(cleaned);
          emitSubtitle(cleaned);
          void processTranscript(cleaned);
        } else if (step !== "confirm") {
          setError(null);
          setStep("listen");
          speakBuddyMessage(BUDDY_REPEAT_PROMPT, { enabled: true });
          emitPhase("listening");
          window.setTimeout(() => startListeningRef.current?.(), 600);
        }
      })
      .finally(() => {
        voiceRef.current = null;
        setIsListening(false);
        setMicReady(false);
      });
  }, [emitPhase, emitSubtitle, isListening, processTranscript, step]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

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

  const pulsePhase: ZeroUiVoicePhase | null = isListening
    ? listenPhase
    : step === "analyze" || step === "images" || step === "intent_ack"
      ? "thinking"
      : null;

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

        {step === "intent_ack" && analysis && (
          <div className="py-4">
            <ZeroUiIntentAck
              summary={analysis.understoodSummary}
              intent={resolveIntentKind(analysis, mode)}
            />
          </div>
        )}

        {(step === "analyze" || step === "images") && (
          <div className="py-4">
            <ZeroUiVoicePulse
              phase="thinking"
              subtitle={displaySubtitle}
              variant="inline"
            />
            <p className="mt-2 text-center text-xs text-[#6b7280]">
              {step === "analyze"
                ? "Gemini analizuoja jūsų užklausą…"
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

        {pulsePhase && step !== "analyze" && step !== "images" && (
          <div className="mt-6">
            <ZeroUiVoicePulse
              phase={pulsePhase}
              subtitle={displaySubtitle}
              variant="hero"
            />
            {isListening && (
              <>
                <p className="mt-2 text-center text-xs text-[#9ca3af]">
                  {micReady
                    ? "Kalbėkite natūraliai — subtitrai atnaujinami gyvai"
                    : "Jungiamas mikrofonas…"}
                </p>
                <button
                  type="button"
                  onClick={() => voiceRef.current?.stop()}
                  className="mx-auto mt-4 block text-sm font-medium text-[#1167b1]"
                >
                  Baigti kalbėti
                </button>
              </>
            )}
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

"use client";

import { Camera, Mic, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { useVauto } from "@/context/VautoContext";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import type { VoiceSession } from "@/lib/audio-session";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";

export function SellerUploadPanel({
  autoOpenPhotoFlow = false,
  onPhotoFlowAutoOpened,
}: {
  autoOpenPhotoFlow?: boolean;
  onPhotoFlowAutoOpened?: () => void;
} = {}) {
  const { submitSellerContent, sellerStep, requestMediaConsent, showToast } =
    useVauto();
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [photoSubmitting, setPhotoSubmitting] = useState(false);
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

  const levelSource = useCallback(
    () => session?.getLevels() ?? Array(9).fill(0.35),
    [session]
  );

  const handleVoice = async () => {
    if (isListening || busy) return;

    requestMediaConsent(async () => {
      const voiceSession = await createVoiceSession();
      setSession(voiceSession);
      setIsListening(true);

      try {
        const transcript = voiceSession
          ? await recordWithSession(voiceSession)
          : null;
        if (transcript?.trim()) {
          setQuery(transcript);
          submitSellerContent({
            text: transcript.trim(),
            voiceCapture: true,
          });
          setQuery("");
        } else {
          showToast(
            "Nepavyko atpažinti balso. Bandykite dar kartą arba įveskite tekstu.",
            "info"
          );
        }
      } finally {
        voiceSession?.release();
        setSession(null);
        setIsListening(false);
      }
    });
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

  if (busy) return null;

  return (
    <>
      <button
        type="button"
        onClick={openPhotoFlow}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1167b1] py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0d5a9a]"
      >
        <Camera className="h-5 w-5" />
        Skelbti su AI (nuotraukos)
      </button>

      <p className="mb-4 text-center text-sm text-[#6b7280]">
        Arba pasakyk balsu / įvesk trumpą aprašymą.
      </p>

      <form
        className="flex items-center gap-2 rounded-xl border border-[#cfd8e3] bg-white py-1.5 pl-4 pr-1.5 shadow-sm"
        onSubmit={handleSubmit}
        aria-label="Skelbimo aprašymas"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[#1167b1]" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Pvz. „Parduodu BMW 5500€ Kaune“'
          enterKeyHint="go"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#6b7280]"
        />
        <button
          type="button"
          onClick={handleVoice}
          disabled={isListening}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f97316] text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60 ${
            isListening ? "animate-pulse" : ""
          }`}
          aria-label="Pasakyti balsu"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>

      <p className="mt-2 text-center text-xs text-[#6b7280]">
        Enter arba mikrofonas — AI atpažins kategoriją, užpildys formą ir pasiūlys kainą.
      </p>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="listing"
        busy={photoSubmitting}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />

      {isListening && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--flux-bg)]/90 backdrop-blur-lg">
          <div className="vauto-flux-glass mx-6 w-full max-w-xs rounded-3xl px-6 py-8 text-center">
            <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
              <span className="mic-ring-pulse absolute inset-0 rounded-full bg-[var(--flux-teal)]/25" />
              <span
                className="mic-ring-pulse absolute inset-0 rounded-full bg-[var(--flux-indigo)]/15"
                style={{ animationDelay: "0.6s" }}
              />
              <span className="vauto-flux-gradient-btn relative flex h-14 w-14 items-center justify-center rounded-2xl">
                <Mic className="h-7 w-7 text-white" fill="white" strokeWidth={0} />
              </span>
            </div>
            <AudioWaveAnimation
              variant="large"
              levelSource={session ? levelSource : undefined}
              className="mb-4"
            />
            <p className="text-sm font-semibold text-white">Klausomasi...</p>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
              Papasakokite ką parduodate ar siūlote
            </p>
          </div>
        </div>
      )}
    </>
  );
}

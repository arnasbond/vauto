"use client";

import { Camera, Mic, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { useVauto } from "@/context/VautoContext";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import type { VoiceSession } from "@/lib/audio-session";

export function SellerUploadPanel() {
  const { submitSellerContent, sellerStep, requestMediaConsent, showToast } = useVauto();
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy =
    sellerStep !== "idle" && sellerStep !== "published";

  const runAi = useCallback(
    (text?: string) => {
      const trimmed = text?.trim() ?? query.trim();
      if (!trimmed && !pendingImage) return;
      submitSellerContent({
        text: trimmed || undefined,
        imageDataUrl: pendingImage,
      });
      setQuery("");
      setPendingImage(null);
    },
    [query, pendingImage, submitSellerContent]
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
            imageDataUrl: pendingImage,
            voiceCapture: true,
          });
          setQuery("");
          setPendingImage(null);
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

  const openFilePicker = () => {
    if (busy) return;
    requestMediaConsent(() => fileInputRef.current?.click());
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (query.trim()) {
        submitSellerContent({ text: query.trim(), imageDataUrl: dataUrl });
        setQuery("");
        setPendingImage(null);
      } else {
        setPendingImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  if (busy) return null;

  return (
    <>
      <p className="mb-4 text-center text-sm text-[var(--vauto-text-muted)]">
        Kas tai per daiktas ar paslauga?
      </p>

      <form
        className="vauto-flux-glass flex items-center gap-2.5 rounded-[20px] py-1.5 pl-4 pr-1.5"
        onSubmit={handleSubmit}
        aria-label="Skelbimo aprašymas"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Pvz. „Parduodu BMW 5500€ Kaune“'
          enterKeyHint="go"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-white outline-none placeholder:text-[var(--vauto-text-muted)]/80"
        />
        <button
          type="button"
          onClick={handleVoice}
          disabled={isListening}
          className={`vauto-flux-gradient-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition hover:opacity-90 disabled:opacity-60 ${
            isListening ? "animate-pulse" : ""
          }`}
          aria-label="Pasakyti balsu"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>

      <p className="mt-2 text-center text-xs text-white/35">
        Enter arba mikrofonas — AI atpažins kategoriją ir atidarys skelbimo formą
      </p>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={openFilePicker}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[var(--vauto-text-muted)] hover:bg-white/[0.08]"
        >
          <Camera className="h-3.5 w-3.5 text-[var(--flux-teal)]" />
          {pendingImage ? "Nuotrauka paruošta" : "Pridėti nuotrauką"}
        </button>
        {pendingImage && (
          <button
            type="button"
            onClick={() => runAi()}
            className="rounded-full bg-[var(--flux-teal)] px-3.5 py-2 text-xs font-semibold text-[var(--flux-bg)]"
          >
            Tęsti su nuotrauka
          </button>
        )}
      </div>

      {pendingImage && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingImage}
            alt="Paruošta nuotrauka"
            className="mx-auto max-h-32 object-cover"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
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

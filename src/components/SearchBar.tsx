"use client";

import { Mic, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { useVauto } from "@/context/VautoContext";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import type { VoiceSession } from "@/lib/audio-session";

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    requestMediaConsent,
    startListingFromQuery,
  } = useVauto();
  const [isListening, setIsListening] = useState(false);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (startListingFromQuery(searchQuery)) {
      setSearchQuery("");
      inputRef.current?.blur();
      return;
    }
    scrollToResults();
    inputRef.current?.blur();
  };

  const levelSource = useCallback(
    () => session?.getLevels() ?? Array(9).fill(0.35),
    [session]
  );

  const handleVoiceSearch = async () => {
    if (isListening) return;

    requestMediaConsent(async () => {
      const voiceSession = await createVoiceSession();
      setSession(voiceSession);
      setIsListening(true);

      try {
        const text = voiceSession ? await recordWithSession(voiceSession) : null;
        if (text) {
          if (startListingFromQuery(text)) {
            setSearchQuery("");
          } else {
            setSearchQuery(text);
            scrollToResults();
          }
        }
      } finally {
        voiceSession?.release();
        setSession(null);
        setIsListening(false);
      }
    });
  };

  return (
    <>
      <form
        className="vauto-flux-glass flex items-center gap-2.5 rounded-[20px] py-1.5 pl-4 pr-1.5"
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pvz. darbas Panevėžyje iki 1200€"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-muted)] outline-none placeholder:text-[var(--vauto-text-muted)]/80"
        />
        <button
          type="button"
          onClick={handleVoiceSearch}
          disabled={isListening}
          className={`vauto-flux-gradient-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition hover:opacity-90 disabled:opacity-60 ${
            isListening ? "animate-pulse" : ""
          }`}
          aria-label="Balso paieška"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>

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
              Pasakykite ką ieškote arba ką norite parduoti
            </p>
          </div>
        </div>
      )}
    </>
  );
}

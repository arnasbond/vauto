"use client";

import { Mic, Sparkles } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { startLiveTranscript } from "@/lib/live-transcript";
import { useVauto } from "@/context/VautoContext";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import type { VoiceSession } from "@/lib/audio-session";

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    requestMediaConsent,
    startListingFromQuery,
    setSearchVoiceMode,
  } = useVauto();
  const [isListening, setIsListening] = useState(false);
  const [liveSubtitle, setLiveSubtitle] = useState("");
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
      setIsListening(true);
      setLiveSubtitle("");
      const stopTranscript = startLiveTranscript(setLiveSubtitle);

      const voiceSession = await createVoiceSession();
      setSession(voiceSession);

      try {
        const text = voiceSession ? await recordWithSession(voiceSession) : null;
        if (text) {
          setSearchVoiceMode(true);
          if (startListingFromQuery(text)) {
            setSearchQuery("");
          } else {
            setSearchQuery(text);
            scrollToResults();
          }
        } else {
          setSearchVoiceMode(false);
        }
      } finally {
        stopTranscript();
        voiceSession?.release();
        setSession(null);
        setIsListening(false);
        setLiveSubtitle("");
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
          onChange={(e) => {
            setSearchVoiceMode(false);
            setSearchQuery(e.target.value);
          }}
          placeholder="Pvz. darbas Panevėžyje iki 1200€"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-muted)] outline-none placeholder:text-[var(--vauto-text-muted)]/80"
        />
        <button
          type="button"
          onClick={handleVoiceSearch}
          disabled={isListening}
          className={`vauto-flux-gradient-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white transition duration-500 ease-in-out hover:opacity-90 disabled:opacity-60 ${
            isListening ? "animate-pulse" : ""
          }`}
          aria-label="Balso paieška"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>

      {isListening && (
        <BuddyVoicePulse
          mode="listening"
          variant="fullscreen"
          subtitle={liveSubtitle}
          statusText="Klausausi paieškos…"
          hint="Pasakykite ką ieškote arba ką norite parduoti"
          levelSource={session ? levelSource : undefined}
        />
      )}
    </>
  );
}

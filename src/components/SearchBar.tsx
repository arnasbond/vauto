"use client";

import { Mic, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { createVoiceSession, recordWithSession } from "@/lib/native-media";
import { useVauto } from "@/context/VautoContext";
import { AudioWaveAnimation } from "@/components/AudioWaveAnimation";
import type { VoiceSession } from "@/lib/audio-session";

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useVauto();
  const [isListening, setIsListening] = useState(false);
  const [session, setSession] = useState<VoiceSession | null>(null);

  const levelSource = useCallback(
    () => session?.getLevels() ?? Array(9).fill(0.35),
    [session]
  );

  const handleVoiceSearch = async () => {
    if (isListening) return;

    const voiceSession = await createVoiceSession();
    setSession(voiceSession);
    setIsListening(true);

    try {
      const text = voiceSession ? await recordWithSession(voiceSession) : null;
      if (text) setSearchQuery(text);
    } finally {
      voiceSession?.release();
      setSession(null);
      setIsListening(false);
    }
  };

  return (
    <>
      <div className="relative flex items-center gap-0">
        <div className="relative flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder=""
            className="w-full rounded-2xl bg-white py-3.5 pl-4 pr-20 text-sm text-[var(--vauto-text)] shadow-lg outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={handleVoiceSearch}
            disabled={isListening}
            className={`absolute right-14 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--vauto-red)] transition hover:bg-red-50 ${
              isListening ? "bg-red-50" : ""
            }`}
            aria-label="Balso paieška"
          >
            <Mic
              className={`h-5 w-5 ${isListening ? "animate-pulse" : ""}`}
              fill="currentColor"
              strokeWidth={0}
            />
          </button>
        </div>
        <button
          type="button"
          className="ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-orange)] text-white shadow-md transition hover:bg-[var(--vauto-orange-light)]"
          aria-label="Ieškoti"
        >
          <Search className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {isListening && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-xs rounded-3xl bg-white px-6 py-8 text-center shadow-2xl">
            <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
              <span className="mic-ring-pulse absolute inset-0 rounded-full bg-[var(--vauto-red)]/25" />
              <span
                className="mic-ring-pulse absolute inset-0 rounded-full bg-[var(--vauto-red)]/15"
                style={{ animationDelay: "0.6s" }}
              />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--vauto-red)] to-[var(--vauto-orange)] shadow-lg">
                <Mic className="h-7 w-7 text-white" fill="white" strokeWidth={0} />
              </span>
            </div>
            <AudioWaveAnimation
              variant="large"
              levelSource={session ? levelSource : undefined}
              className="mb-4"
            />
            <p className="text-sm font-semibold text-[var(--vauto-text)]">
              Klausomasi...
            </p>
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">
              Pasakykite ką ieškote
            </p>
          </div>
        </div>
      )}
    </>
  );
}

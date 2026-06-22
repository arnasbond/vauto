"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";
import { useVauto } from "@/context/VautoContext";
import { BuddyVoicePulse } from "@/components/buddy/BuddyVoicePulse";
import type { VoiceSearchSession } from "@/lib/voice-search";
import { capturePhoto } from "@/lib/native-media";
import { extractFromImage } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    requestMediaConsent,
    startListingFromQuery,
    setSearchVoiceMode,
    showToast,
    user,
  } = useVauto();
  const [isListening, setIsListening] = useState(false);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [liveSubtitle, setLiveSubtitle] = useState("");
  const [micReady, setMicReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<VoiceSearchSession | null>(null);

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

  const handleVoiceSearch = () => {
    if (isListening || isPhotoSearching) return;

    if (!isVoiceSearchSupported()) {
      showToast("Ši naršyklė nepalaiko balso paieškos", "error");
      return;
    }

    requestMediaConsent(() => {
      setIsListening(true);
      setMicReady(false);
      setLiveSubtitle("");

      const session = startVoiceSearch({
        onStart: () => setMicReady(true),
        onInterim: setLiveSubtitle,
        silenceMs: 2_800,
        maxMs: 25_000,
      });
      voiceRef.current = session;

      void session.promise
        .then((text) => {
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
            showToast("Nepavyko atpažinti balso — bandykite dar kartą", "info");
          }
        })
        .finally(() => {
          voiceRef.current = null;
          setIsListening(false);
          setMicReady(false);
          setLiveSubtitle("");
        });
    });
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || isListening) return;

    requestMediaConsent(async () => {
      setIsPhotoSearching(true);
      try {
        const photo = await capturePhoto();
        if (!photo) return;
        const extracted = await extractFromImage({
          imageDataUrl: photo,
          userCity: user.city || "Lietuva",
          contact: user.phone || "+370 612 34567",
        });
        const query = buildPhotoSearchQuery(extracted);
        setSearchVoiceMode(false);
        setSearchQuery(query);
        showToast(buildPhotoSearchToast(extracted), "success");
        scrollToResults();
      } catch (error) {
        showToast(
          error instanceof Error
            ? `Nuotraukos paieška nepavyko: ${error.message}`
            : "Nuotraukos paieška nepavyko",
          "error"
        );
      } finally {
        setIsPhotoSearching(false);
      }
    });
  };

  const handleFinishVoice = () => {
    voiceRef.current?.stop();
  };

  return (
    <>
      <form
        className="flex items-center gap-2 rounded-xl border border-[#cfd8e3] bg-white py-1.5 pl-4 pr-1.5 shadow-sm"
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[#1167b1]" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={searchQuery}
          onChange={(e) => {
            setSearchVoiceMode(false);
            setSearchQuery(e.target.value);
          }}
          placeholder="Pvz. iPhone 13 Vilniuje arba darbas Kaune"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#1f2937] outline-none placeholder:text-[#6b7280]"
        />
        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || isListening}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#bfdbfe] bg-[#eef6ff] text-[#1167b1] transition hover:bg-[#dbeafe] disabled:opacity-60"
          aria-label="Ieškoti pagal nuotrauką"
          title="Ieškoti pagal nuotrauką"
        >
          {isPhotoSearching ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleVoiceSearch}
          disabled={isListening || isPhotoSearching}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f97316] text-white shadow-sm transition duration-500 ease-in-out hover:bg-[#ea580c] disabled:opacity-60 ${
            isListening ? "animate-pulse" : ""
          }`}
          aria-label="Balso paieška"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-[#6b7280]">
        Nufotografuokite prekę — VAUTO atpažins ir suras panašius skelbimus.
      </p>

      {isListening && (
        <BuddyVoicePulse
          mode="listening"
          variant="fullscreen"
          subtitle={liveSubtitle}
          statusText={
            micReady ? "Klausausi paieškos…" : "Jungiamas mikrofonas…"
          }
          hint={
            micReady
              ? "Pasakykite ką ieškote — sustos po pauzės arba spauskite „Baigti“"
              : "Leiskite mikrofono prieigą, jei paprašys"
          }
          onCancel={handleFinishVoice}
          cancelLabel="Baigti"
        />
      )}
    </>
  );
}

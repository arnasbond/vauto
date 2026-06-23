"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { isVoiceSearchSupported } from "@/lib/voice-search";
import { useVauto } from "@/context/VautoContext";
import { extractFromImage, extractFromText } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";
import { detectSellerListingIntent } from "@/lib/scoring";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import {
  VoiceClarifyFlowSheet,
  type VoiceClarifyResult,
} from "@/components/voice/VoiceClarifyFlowSheet";

export function SearchBar() {
  const {
    searchQuery,
    setSearchQuery,
    requestMediaConsent,
    startListingFromQuery,
    setSearchVoiceMode,
    setSearchInputMode,
    showToast,
    user,
  } = useVauto();
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [isVoiceFlowBusy, setIsVoiceFlowBusy] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [voiceFlowOpen, setVoiceFlowOpen] = useState(false);
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
    setSearchInputMode("text");
    scrollToResults();
    inputRef.current?.blur();
  };

  const handleVoiceSearch = () => {
    if (isPhotoSearching || isVoiceFlowBusy || voiceFlowOpen) return;

    if (!isVoiceSearchSupported()) {
      showToast("Ši naršyklė nepalaiko balso paieškos", "error");
      return;
    }

    requestMediaConsent(() => setVoiceFlowOpen(true));
  };

  const handleVoiceFlowComplete = async (result: VoiceClarifyResult) => {
    setIsVoiceFlowBusy(true);
    try {
      const text = result.mergedTranscript;
      if (detectSellerListingIntent(text)) {
        setVoiceFlowOpen(false);
        if (startListingFromQuery(text)) return;
      }

      const extracted = await extractFromText({
        transcript: text,
        userCity: user.city || "Lietuva",
        contact: user.phone || "+370 612 34567",
      });
      const query = buildPhotoSearchQuery(extracted);
      setSearchInputMode("voice");
      setSearchVoiceMode(true);
      setSearchQuery(query);
      showToast(buildPhotoSearchToast(extracted), "success");
      setVoiceFlowOpen(false);
      scrollToResults();
    } catch (error) {
      showToast(
        error instanceof Error
          ? `Balso paieška nepavyko: ${error.message}`
          : "Balso paieška nepavyko",
        "error"
      );
    } finally {
      setIsVoiceFlowBusy(false);
    }
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || isVoiceFlowBusy || voiceFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (result: AiPhotoFlowResult) => {
    setIsPhotoSearching(true);
    try {
      const extracted = await extractFromImage({
        imageDataUrl: result.photos[0],
        imageDataUrls: result.photos,
        extraContext: result.extraContext || undefined,
        fileName: result.fileName,
        userCity: user.city || "Lietuva",
        contact: user.phone || "+370 612 34567",
      });
      const query = buildPhotoSearchQuery(extracted);
      setSearchInputMode("photo");
      setSearchVoiceMode(false);
      setSearchQuery(query);
      showToast(buildPhotoSearchToast(extracted), "success");
      setPhotoFlowOpen(false);
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
            setSearchInputMode("text");
            setSearchQuery(e.target.value);
          }}
          placeholder="Pvz. iPhone 13 Vilniuje arba darbas Kaune"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#1f2937] outline-none placeholder:text-[#6b7280]"
        />
        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || isVoiceFlowBusy || voiceFlowOpen}
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
          disabled={isPhotoSearching || isVoiceFlowBusy || voiceFlowOpen}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f97316] text-white shadow-sm transition duration-500 ease-in-out hover:bg-[#ea580c] disabled:opacity-60 ${
            voiceFlowOpen ? "animate-pulse" : ""
          }`}
          aria-label="Balso paieška"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-[#6b7280]">
        Pasakykite ar nufotografuokite prekę — AI patikslins ir suras panašius skelbimus.
      </p>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="search"
        busy={isPhotoSearching}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />

      <VoiceClarifyFlowSheet
        open={voiceFlowOpen}
        mode="search"
        userCity={user.city || "Lietuva"}
        busy={isVoiceFlowBusy}
        onClose={() => setVoiceFlowOpen(false)}
        onComplete={handleVoiceFlowComplete}
      />
    </>
  );
}

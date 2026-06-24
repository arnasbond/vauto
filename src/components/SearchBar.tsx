"use client";

import { Camera, Loader2, Mic, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { isVoiceSearchSupported } from "@/lib/voice-search";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { extractFromImage } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { detectSellerListingIntent } from "@/lib/scoring";
import { isSellIntent } from "@/lib/gemini-intent";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
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
    applyVisualSearch,
    clearVisualSearch,
    showToast,
    user,
    sellerStep,
    chameleonTheme,
  } = useVauto();
  const { sendAgentMessage, setOpen: setAgentOpen, busy: agentBusy } = useVautoAgent();
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [isVoiceFlowBusy, setIsVoiceFlowBusy] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [voiceFlowOpen, setVoiceFlowOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = sanitizeSearchQuery(searchQuery, "final");
    if (!q) return;

    if (startListingFromQuery(q)) {
      setSearchQuery("");
      inputRef.current?.blur();
      return;
    }

    setSearchInputMode("text");
    scrollToResults();
    inputRef.current?.blur();
  };

  const handleGeminiSend = () => {
    const q = sanitizeSearchQuery(searchQuery, "final");
    if (!q || agentBusy) return;

    setSearchInputMode("text");
    setSearchQuery(q);
    setAgentOpen(true);
    void sendAgentMessage(q);
  };

  const routeToGeminiAgent = (text: string) => {
    const q = sanitizeSearchQuery(text, "final");
    if (!q) return;
    setSearchQuery(q);
    setAgentOpen(true);
    void sendAgentMessage(q);
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
      const listingIntent =
        result.analysis.intent === "sell" ||
        detectSellerListingIntent(text);

      setVoiceFlowOpen(false);

      if (listingIntent) {
        setSearchInputMode("voice");
        setSearchVoiceMode(false);
        routeToGeminiAgent(text);
        return;
      }

      setSearchInputMode("voice");
      setSearchVoiceMode(true);
      setSearchQuery(text);
      scrollToResults();
      routeToGeminiAgent(text);
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

      setPhotoFlowOpen(false);

      const contextText = [result.extraContext, extracted.title].filter(Boolean).join(" ");
      if (isSellIntent(contextText, extracted)) {
        setSearchInputMode("photo");
        setSearchVoiceMode(false);
        routeToGeminiAgent(
          result.extraContext?.trim() ||
            `Noriu įkelti skelbimą: ${extracted.title}`
        );
        return;
      }

      if (extracted.confidence < 0.4) {
        showToast(
          "AI nepavyko tiksliai atpažinti nuotraukoje. Bandykite dar kartą arba įveskite paiešką ranka.",
          "error"
        );
        return;
      }

      const query = buildPhotoSearchQuery(extracted);
      setSearchInputMode("photo");
      setSearchVoiceMode(false);
      setSearchQuery(query);
      void applyVisualSearch(
        buildVisualSearchProfile(extracted, "photo", result.photos[0])
      );
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
  };

  return (
    <>
      <form
        className="flex items-center gap-2 rounded-xl border bg-white py-1.5 pl-4 pr-1.5 shadow-sm transition-colors"
        style={{ borderColor: ui.searchBorder }}
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles className="h-4 w-4 shrink-0" style={{ color: ui.accent }} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          name="q"
          value={searchQuery}
          onChange={(e) => {
            setSearchVoiceMode(false);
            setSearchInputMode("text");
            clearVisualSearch({ keepInputMode: true });
            setSearchQuery(e.target.value);
          }}
          placeholder="Paklauskite Gemini — pvz. iPhone 13 Vilniuje arba noriu įkelti skelbimą"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#111827] caret-[#1167b1] placeholder:text-[#9ca3af] outline-none"
          disabled={agentBusy}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleGeminiSend}
          disabled={agentBusy || !searchQuery.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition disabled:opacity-60"
          style={{ backgroundColor: ui.accent }}
          aria-label="Siųsti Gemini asistentui"
          title="Siųsti Gemini asistentui"
        >
          {agentBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </button>
        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || isVoiceFlowBusy || voiceFlowOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-60"
          style={{
            borderColor: ui.searchBorder,
            background: `${ui.accent}14`,
            color: ui.accent,
          }}
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
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition duration-500 ease-in-out disabled:opacity-60 ${
            voiceFlowOpen ? "animate-pulse" : ""
          }`}
          style={{ backgroundColor: ui.cta }}
          aria-label="Balso paieška"
        >
          <Mic className="h-5 w-5" fill="currentColor" strokeWidth={0} />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-[#6b7280]">
        Vienas laukas — Enter ieško skelbimų, ✨ siunčia Gemini. Balsas ir nuotrauka — šalia.
      </p>
      <div className="mt-1.5 flex justify-center">
        <AiModeBadge compact />
      </div>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="search"
        busy={isPhotoSearching}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />

      <VoiceClarifyFlowSheet
        open={voiceFlowOpen}
        mode={detectSellerListingIntent(searchQuery) ? "listing" : "search"}
        userCity={user.city || "Lietuva"}
        busy={isVoiceFlowBusy}
        onClose={() => setVoiceFlowOpen(false)}
        onComplete={handleVoiceFlowComplete}
      />
    </>
  );
}

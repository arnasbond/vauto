"use client";

import { Camera, Loader2, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { extractFromImage } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { isSellIntent } from "@/lib/gemini-intent";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";

const GEMINI_BLUE = "#1167b1";

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

  const { sendAgentMessage, busy: agentBusy } = useVautoAgent();

  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive = agentBusy || isPhotoSearching || photoFlowOpen;

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
    void sendAgentMessage(q);
  };

  const routeToGeminiAgent = (text: string) => {
    const q = sanitizeSearchQuery(text, "final");
    if (!q) return;
    setSearchQuery(q);
    void sendAgentMessage(q);
  };

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen) return;
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
          result.extraContext?.trim() || `Noriu įkelti skelbimą: ${extracted.title}`
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
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-white py-1.5 pl-3.5 pr-1.5 shadow-sm transition-colors",
          zeroUiActive && "zero-ui-search-active"
        )}
        style={{ borderColor: ui.searchBorder }}
        onSubmit={handleSearchSubmit}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles
          className={cn(
            "h-4 w-4 shrink-0 transition-opacity",
            agentBusy && "zero-ui-icon-pulse"
          )}
          style={{ color: GEMINI_BLUE }}
          aria-hidden
        />

        <input
          ref={inputRef}
          type="search"
          name="q"
          role="searchbox"
          value={searchQuery}
          onChange={(e) => {
            setSearchVoiceMode(false);
            setSearchInputMode("text");
            clearVisualSearch({ keepInputMode: true });
            setSearchQuery(e.target.value);
          }}
          placeholder="Paklauskite Gemini — pvz. iPhone 13 arba Volvo Kaune"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-[#111827] caret-[#1167b1] placeholder:text-[#9ca3af] outline-none"
          disabled={agentBusy}
          autoComplete="off"
        />

        <button
          type="button"
          onClick={handleGeminiSend}
          disabled={agentBusy || !searchQuery.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1167b1] transition hover:bg-[#eef6ff] disabled:opacity-40"
          aria-label="Siųsti Gemini asistentui"
          title="Siųsti Gemini"
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
          disabled={isPhotoSearching || photoFlowOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#1167b1] transition hover:bg-[#eef6ff] disabled:opacity-40"
          aria-label="Ieškoti ar analizuoti pagal nuotrauką"
          title="Nuotrauka — Vision AI"
        >
          {isPhotoSearching ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
      </form>

      <p className="mt-2 text-center text-[11px] text-[#6b7280]">
        ✨ Gemini · 📷 nuotrauka — paieška ir analizė. Skelbimui įkelti naudokite + apačioje.
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
    </>
  );
}

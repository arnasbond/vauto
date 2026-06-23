"use client";

import { useState } from "react";
import { Camera, Mic, Zap } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { extractFromImage, extractFromText } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { isVoiceSearchSupported } from "@/lib/voice-search";
import { SERVICE_REQUEST_TEMPLATES } from "@/lib/service-leads";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";
import {
  VoiceClarifyFlowSheet,
  type VoiceClarifyResult,
} from "@/components/voice/VoiceClarifyFlowSheet";

export function ServiceRequestCard() {
  const {
    setSearchQuery,
    startListingFromQuery,
    showToast,
    requestMediaConsent,
    setSearchInputMode,
    setSearchVoiceMode,
    applyVisualSearch,
    user,
  } = useVauto();

  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [voiceFlowOpen, setVoiceFlowOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyServiceSearch = async (
    extracted: Awaited<ReturnType<typeof extractFromText>>,
    mode: "voice" | "photo",
    previewImage?: string | null
  ) => {
    const query = buildPhotoSearchQuery(extracted) || "reikia meistro Vilniuje";
    setSearchInputMode(mode);
    setSearchVoiceMode(mode === "voice");
    setSearchQuery(query);
    void applyVisualSearch(buildVisualSearchProfile(extracted, mode, previewImage));
    showToast(buildPhotoSearchToast(extracted), "success");
    scrollToResults();
  };

  const startVoiceStyleRequest = () => {
    if (voiceBusy || photoBusy || voiceFlowOpen) return;
    if (!isVoiceSearchSupported()) {
      showToast("Ši naršyklė nepalaiko balso įvedimo", "error");
      return;
    }
    requestMediaConsent(() => setVoiceFlowOpen(true));
  };

  const startPhotoStyleRequest = () => {
    if (voiceBusy || photoBusy || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handleVoiceComplete = async (result: VoiceClarifyResult) => {
    setVoiceBusy(true);
    try {
      const extracted = await extractFromText({
        transcript: result.mergedTranscript,
        userCity: user.city || "Lietuva",
        contact: user.phone || "+370 612 34567",
      });
      await applyServiceSearch(extracted, "voice");
      setVoiceFlowOpen(false);
    } catch (error) {
      showToast(
        error instanceof Error
          ? `Balso užklausa nepavyko: ${error.message}`
          : "Balso užklausa nepavyko",
        "error"
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  const handlePhotoSubmit = async (result: AiPhotoFlowResult) => {
    setPhotoBusy(true);
    try {
      const extracted = await extractFromImage({
        imageDataUrl: result.photos[0],
        imageDataUrls: result.photos,
        extraContext: result.extraContext || "Paslaugos užklausa — remontas ar gedimas",
        fileName: result.fileName,
        userCity: user.city || "Lietuva",
        contact: user.phone || "+370 612 34567",
      });
      await applyServiceSearch(extracted, "photo", result.photos[0]);
      setPhotoFlowOpen(false);
    } catch (error) {
      showToast(
        error instanceof Error
          ? `Foto užklausa nepavyko: ${error.message}`
          : "Foto užklausa nepavyko",
        "error"
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <>
      <section className="mb-5 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#f97316] shadow-sm">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f97316]">
              Reikia paslaugos?
            </p>
            <h2 className="mt-1 text-base font-extrabold text-[#111827]">
              Pasakyk problemą — VAUTO suras meistrą
            </h2>
            <p className="mt-2 text-sm text-[#6b7280]">
              Kliento užklausa tampa aktyviu lead’u: meistrai gauna pranešimą ir
              gali vienu mygtuku atidaryti pokalbį.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={startVoiceStyleRequest}
                disabled={voiceBusy || photoBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f97316] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                <Mic className="h-3.5 w-3.5" />
                Balsu
              </button>
              <button
                type="button"
                onClick={startPhotoStyleRequest}
                disabled={voiceBusy || photoBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#f97316] bg-white px-3 py-2.5 text-xs font-bold text-[#f97316] disabled:opacity-60"
              >
                <Camera className="h-3.5 w-3.5" />
                Foto
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SERVICE_REQUEST_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => {
                if (!startListingFromQuery(template.query)) setSearchQuery(template.query);
              }}
              className="rounded-full border border-[#fdba74] bg-white px-3 py-1.5 text-xs font-semibold text-[#9a3412] hover:bg-orange-50"
            >
              {template.label}
            </button>
          ))}
        </div>
      </section>

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="search"
        busy={photoBusy}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoSubmit}
      />

      <VoiceClarifyFlowSheet
        open={voiceFlowOpen}
        mode="search"
        userCity={user.city || "Lietuva"}
        busy={voiceBusy}
        onClose={() => setVoiceFlowOpen(false)}
        onComplete={handleVoiceComplete}
      />
    </>
  );
}

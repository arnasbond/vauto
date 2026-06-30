"use client";

import { useState } from "react";
import { Camera, Zap } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { extractFromImage } from "@/lib/client-api";
import { buildPhotoSearchQuery, buildPhotoSearchToast } from "@/lib/photo-search";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { SERVICE_REQUEST_TEMPLATES } from "@/lib/service-leads";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
} from "@/components/photo/AiPhotoFlowSheet";

export function ServiceRequestCard() {
  const {
    setSearchQuery,
    startListingFromQuery,
    showToast,
    requestMediaConsent,
    setSearchInputMode,
    applyVisualSearch,
    user,
  } = useVauto();

  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyServiceSearch = async (
    extracted: Awaited<ReturnType<typeof extractFromImage>>,
    previewImage?: string | null
  ) => {
    const query = buildPhotoSearchQuery(extracted) || "reikia meistro Vilniuje";
    setSearchInputMode("photo");
    setSearchQuery(query);
    void applyVisualSearch(buildVisualSearchProfile(extracted, "photo", previewImage));
    showToast(buildPhotoSearchToast(extracted), "success");
    scrollToResults();
  };

  const startPhotoStyleRequest = () => {
    if (photoBusy || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
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
      await applyServiceSearch(extracted, result.photos[0]);
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
              Aprašyk problemą — VAUTO suras meistrą
            </h2>
            <p className="mt-2 text-sm text-[#6b7280]">
              Kliento užklausa tampa aktyviu lead’u: meistrai gauna pranešimą ir
              gali vienu mygtuku atidaryti pokalbį.
            </p>
            <button
              type="button"
              onClick={startPhotoStyleRequest}
              disabled={photoBusy}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#f97316] px-3 py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" />
              Įkelti nuotrauką
            </button>
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
    </>
  );
}

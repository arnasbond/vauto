"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import { LT_CITY_NAMES } from "@/lib/lt-cities";
import { cn } from "@/lib/cn";
import { pickListingPhotoDirect } from "@/lib/direct-agent-actions";
import {
  draftPatchFromParsedContacts,
  formatPhoneForDisplay,
  parseListingContactFromText,
} from "@/lib/listing-contact-parse";
import {
  buildGapQuickReplies,
  buildGapStatusSummary,
  type PrePublishRequirementsPayload,
} from "@/lib/pre-publish-requirements";
import type { ListingWizardGapField } from "@/lib/listing-wizard-flow";
import type { AiExtractedListing } from "@/lib/types";

const TOP_CITIES = LT_CITY_NAMES.slice(0, 16);

export interface PrePublishRequirementsWidgetProps {
  requirements: PrePublishRequirementsPayload;
  aiDraft: AiExtractedListing | null;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  updateSellerMedia: (patch: { imageDataUrl?: string | null }) => void;
  updateUser?: (patch: { phone?: string; city?: string }) => void;
  activeGapField?: ListingWizardGapField | null;
  onGapChipSelect?: (field: ListingWizardGapField | null) => void;
  onGapChipAction?: (chip: string) => void;
  className?: string;
}

export function PrePublishRequirementsWidget({
  requirements,
  aiDraft,
  updateAiDraft,
  updateSellerMedia,
  updateUser,
  activeGapField = null,
  onGapChipSelect,
  onGapChipAction,
  className,
}: PrePublishRequirementsWidgetProps) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoDone, setPhotoDone] = useState(
    Boolean(requirements.hasPhoto && !requirements.missingPhoto)
  );
  const [phoneValue, setPhoneValue] = useState(
    requirements.resolvedPhone && !requirements.missingPhone
      ? formatPhoneForDisplay(requirements.resolvedPhone)
      : ""
  );
  const [phoneDone, setPhoneDone] = useState(!requirements.missingPhone);
  const [cityValue, setCityValue] = useState(
    requirements.resolvedCity && !requirements.missingCity
      ? requirements.resolvedCity
      : ""
  );
  const [cityDone, setCityDone] = useState(!requirements.missingCity);
  const [priceValue, setPriceValue] = useState("");
  const [priceDone, setPriceDone] = useState(!requirements.missingPrice);
  const phoneRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLSelectElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPhotoDone(Boolean(requirements.hasPhoto && !requirements.missingPhoto));
    setPhoneDone(!requirements.missingPhone);
    setCityDone(!requirements.missingCity);
    setPriceDone(!requirements.missingPrice);
    if (requirements.resolvedPhone && !requirements.missingPhone) {
      setPhoneValue(formatPhoneForDisplay(requirements.resolvedPhone));
    }
    if (requirements.resolvedCity && !requirements.missingCity) {
      setCityValue(requirements.resolvedCity);
    }
  }, [requirements]);

  useEffect(() => {
    if (activeGapField === "phone") phoneRef.current?.focus();
    if (activeGapField === "city") cityRef.current?.focus();
    if (activeGapField === "price") priceRef.current?.focus();
  }, [activeGapField]);

  const gapChips = buildGapQuickReplies(requirements);
  const statusSummary = buildGapStatusSummary(requirements);

  const applyContactPatch = useCallback(
    (parsed: ReturnType<typeof parseListingContactFromText>) => {
      if (!aiDraft || !parsed.hasAny) return;
      updateAiDraft(draftPatchFromParsedContacts(parsed));
      if (updateUser) {
        const patch: { phone?: string; city?: string } = {};
        if (parsed.phone) patch.phone = parsed.phone;
        if (parsed.city) patch.city = parsed.city;
        if (Object.keys(patch).length) updateUser(patch);
      }
    },
    [aiDraft, updateAiDraft, updateUser]
  );

  const handleAddPhoto = useCallback(async () => {
    if (photoBusy || photoDone) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await pickListingPhotoDirect("gallery");
      if (!dataUrl) return;
      updateSellerMedia({ imageDataUrl: dataUrl });
      if (aiDraft) {
        updateAiDraft({
          orderedImageUrls: [dataUrl, ...(aiDraft.orderedImageUrls ?? [])].slice(0, 6),
        });
      }
      setPhotoDone(true);
    } finally {
      setPhotoBusy(false);
    }
  }, [photoBusy, photoDone, updateSellerMedia, aiDraft, updateAiDraft]);

  const handleChipSelect = useCallback(
    (chip: string) => {
      onGapChipAction?.(chip);
      const field =
        chip.includes("nuotrauk") ? "photo" :
        chip.includes("telefon") ? "phone" :
        chip.includes("miest") ? "city" :
        chip.includes("kain") ? "price" :
        null;
      if (field === "photo") {
        void handleAddPhoto();
        return;
      }
      if (field) onGapChipSelect?.(field);
    },
    [handleAddPhoto, onGapChipAction, onGapChipSelect]
  );

  const commitPhone = useCallback(() => {
    const parsed = parseListingContactFromText(phoneValue, { prioritizeField: "phone" });
    if (!parsed.phone) return;
    applyContactPatch(parsed);
    setPhoneValue(formatPhoneForDisplay(parsed.phone));
    setPhoneDone(true);
    onGapChipSelect?.(null);
  }, [phoneValue, applyContactPatch, onGapChipSelect]);

  const commitCity = useCallback(() => {
    const parsed = parseListingContactFromText(cityValue, { prioritizeField: "city" });
    if (!parsed.city) return;
    applyContactPatch(parsed);
    setCityValue(parsed.city);
    setCityDone(true);
    onGapChipSelect?.(null);
  }, [cityValue, applyContactPatch, onGapChipSelect]);

  const commitPrice = useCallback(() => {
    const raw = priceValue.replace(/[^\d.,]/g, "").replace(",", ".");
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0 || !aiDraft) return;
    updateAiDraft({ price: Math.round(n) });
    setPriceDone(true);
    onGapChipSelect?.(null);
  }, [priceValue, aiDraft, updateAiDraft, onGapChipSelect]);

  const panelClass =
    "rounded-xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-surface-muted)]/35 p-3";

  return (
    <div
      className={cn(
        "pre-publish-requirements-widget w-full max-w-[min(100%,20.5rem)] space-y-2.5 md:max-w-sm",
        className
      )}
    >
      <div className={panelClass}>
        <p className="text-xs font-medium text-[var(--vauto-text-muted)]">{statusSummary}</p>
        {gapChips.length > 0 && (
          <AgentQuickReplyChips
            options={gapChips}
            disabled={photoBusy}
            onSelect={(chip) => void handleChipSelect(chip)}
            embedded
          />
        )}
      </div>

      {photoDone && (
        <p className="text-sm font-semibold text-emerald-700">✅ Nuotrauka pridėta</p>
      )}
      {photoBusy && (
        <p className="flex items-center gap-2 text-sm text-[var(--vauto-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Įkeliama nuotrauka…
        </p>
      )}

      {activeGapField === "phone" && !phoneDone && (
          <div className={cn(panelClass, "space-y-2")}>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
              Telefonas
            </label>
            <div className="flex gap-2">
              <input
                ref={phoneRef}
                type="tel"
                inputMode="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                placeholder="068876808"
                className="min-h-[40px] flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 text-sm outline-none focus:border-[var(--vauto-primary)]"
              />
              <button
                type="button"
                onClick={commitPhone}
                className="shrink-0 rounded-lg bg-[var(--vauto-primary)] px-3 text-xs font-bold text-[var(--vauto-primary-contrast,#fff)]"
              >
                OK
              </button>
            </div>
          </div>
        )}
      {phoneDone && activeGapField !== "phone" && requirements.missingPhone === false && (
        <p className="text-sm font-semibold text-emerald-700">✅ Telefonas pridėtas</p>
      )}

      {activeGapField === "city" && !cityDone && (
        <div className={cn(panelClass, "space-y-2")}>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Miestas
          </label>
          <div className="flex gap-2">
            <select
              ref={cityRef}
              value={cityValue}
              onChange={(e) => setCityValue(e.target.value)}
              className="min-h-[40px] flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 text-sm outline-none focus:border-[var(--vauto-primary)]"
            >
              <option value="">Pasirinkite miestą</option>
              {TOP_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={commitCity}
              disabled={!cityValue.trim()}
              className="shrink-0 rounded-lg bg-[var(--vauto-primary)] px-3 text-xs font-bold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-50"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {cityDone && activeGapField !== "city" && requirements.missingCity === false && (
        <p className="flex items-center gap-1 text-sm font-semibold text-emerald-700">
          <MapPin className="h-3.5 w-3.5" /> ✅ {cityValue}
        </p>
      )}

      {activeGapField === "price" && !priceDone && (
        <div className={cn(panelClass, "space-y-2")}>
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Kaina (€)
          </label>
          <div className="flex gap-2">
            <input
              ref={priceRef}
              type="text"
              inputMode="decimal"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder="1200"
              className="min-h-[40px] flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 text-sm outline-none focus:border-[var(--vauto-primary)]"
            />
            <button
              type="button"
              onClick={commitPrice}
              className="shrink-0 rounded-lg bg-[var(--vauto-primary)] px-3 text-xs font-bold text-[var(--vauto-primary-contrast,#fff)]"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {priceDone && activeGapField !== "price" && requirements.missingPrice === false && (
        <p className="text-sm font-semibold text-emerald-700">✅ Kaina nustatyta</p>
      )}

      {requirements.missingAuth && (
        <p className="text-xs text-[var(--vauto-text-muted)]">
          Publikavimui reikia prisijungti prie paskyros.
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, Check, Loader2, MapPin } from "lucide-react";
import { LT_CITY_NAMES } from "@/lib/lt-cities";
import { cn } from "@/lib/cn";
import { pickListingPhotoDirect } from "@/lib/direct-agent-actions";
import {
  draftPatchFromParsedContacts,
  formatPhoneForDisplay,
  parseListingContactFromText,
} from "@/lib/listing-contact-parse";
import type { PrePublishRequirementsPayload } from "@/lib/pre-publish-requirements";
import type { AiExtractedListing } from "@/lib/types";

const TOP_CITIES = LT_CITY_NAMES.slice(0, 12);

export interface PrePublishRequirementsWidgetProps {
  requirements: PrePublishRequirementsPayload;
  aiDraft: AiExtractedListing | null;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  updateSellerMedia: (patch: { imageDataUrl?: string | null }) => void;
  updateUser?: (patch: { phone?: string; city?: string }) => void;
  className?: string;
}

export function PrePublishRequirementsWidget({
  requirements,
  aiDraft,
  updateAiDraft,
  updateSellerMedia,
  updateUser,
  className,
}: PrePublishRequirementsWidgetProps) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoDone, setPhotoDone] = useState(Boolean(requirements.hasPhoto && !requirements.missingPhoto));
  const [phoneValue, setPhoneValue] = useState(
    requirements.resolvedPhone && !requirements.missingPhone
      ? formatPhoneForDisplay(requirements.resolvedPhone)
      : ""
  );
  const [phoneDone, setPhoneDone] = useState(!requirements.missingPhone);
  const [cityValue, setCityValue] = useState(
    requirements.resolvedCity && !requirements.missingCity ? requirements.resolvedCity : ""
  );
  const [cityDone, setCityDone] = useState(!requirements.missingCity);
  const [activeField, setActiveField] = useState<"phone" | "city" | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLSelectElement>(null);

  const applyContactPatch = useCallback(
    async (parsed: ReturnType<typeof parseListingContactFromText>) => {
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

  const handlePhoneFocus = useCallback(() => {
    setActiveField("phone");
    requestAnimationFrame(() => phoneRef.current?.focus());
  }, []);

  const handleCityFocus = useCallback(() => {
    setActiveField("city");
    requestAnimationFrame(() => cityRef.current?.focus());
  }, []);

  const commitPhone = useCallback(async () => {
    const parsed = parseListingContactFromText(phoneValue, { prioritizeField: "phone" });
    if (!parsed.phone) return;
    await applyContactPatch(parsed);
    setPhoneValue(formatPhoneForDisplay(parsed.phone));
    setPhoneDone(true);
    setActiveField(null);
  }, [phoneValue, applyContactPatch]);

  const commitCity = useCallback(async () => {
    const parsed = parseListingContactFromText(cityValue, { prioritizeField: "city" });
    if (!parsed.city) return;
    await applyContactPatch(parsed);
    setCityValue(parsed.city);
    setCityDone(true);
    setActiveField(null);
  }, [cityValue, applyContactPatch]);

  const rowClass =
    "flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[var(--vauto-primary)]/15 bg-[var(--vauto-surface-muted)]/40 px-3 py-2.5 transition";

  return (
    <div
      className={cn(
        "pre-publish-requirements-widget w-full max-w-[min(100%,20.5rem)] space-y-2 md:max-w-sm",
        className
      )}
    >
      {(requirements.missingPhoto || photoDone) && (
        <div className={rowClass}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--vauto-primary)]/10 text-lg">
            {photoDone ? <Check className="h-5 w-5 text-emerald-600" /> : "📷"}
          </span>
          <div className="min-w-0 flex-1">
            {photoDone ? (
              <p className="text-sm font-semibold text-emerald-700">✅ Nuotrauka pridėta</p>
            ) : (
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => void handleAddPhoto()}
                className="flex w-full touch-manipulation items-center gap-2 text-left text-sm font-semibold text-[var(--vauto-text)] disabled:opacity-60"
              >
                {photoBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--vauto-primary)]" />
                ) : (
                  <Camera className="h-4 w-4 text-[var(--vauto-primary)]" />
                )}
                Pridėti nuotrauką
              </button>
            )}
          </div>
        </div>
      )}

      {(requirements.missingPhone || phoneDone) && (
        <div className={cn(rowClass, activeField === "phone" && "ring-2 ring-[var(--vauto-primary)]/30")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--vauto-primary)]/10 text-lg">
            {phoneDone ? <Check className="h-5 w-5 text-emerald-600" /> : "📞"}
          </span>
          <div className="min-w-0 flex-1">
            {phoneDone && activeField !== "phone" ? (
              <button
                type="button"
                onClick={handlePhoneFocus}
                className="w-full text-left text-sm font-semibold text-emerald-700"
              >
                ✅ {phoneValue || "Telefonas įvestas"}
              </button>
            ) : (
              <div className="flex flex-col gap-1">
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
                    className="min-h-[36px] flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 text-sm text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => void commitPhone()}
                    className="shrink-0 rounded-lg bg-[var(--vauto-primary)] px-3 text-xs font-bold text-[var(--vauto-primary-contrast,#fff)]"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(requirements.missingCity || cityDone) && (
        <div className={cn(rowClass, activeField === "city" && "ring-2 ring-[var(--vauto-primary)]/30")}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--vauto-primary)]/10 text-lg">
            {cityDone ? <Check className="h-5 w-5 text-emerald-600" /> : "📍"}
          </span>
          <div className="min-w-0 flex-1">
            {cityDone && activeField !== "city" ? (
              <button
                type="button"
                onClick={handleCityFocus}
                className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-emerald-700"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                ✅ {cityValue}
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
                  Miestas
                </label>
                <div className="flex gap-2">
                  <select
                    ref={cityRef}
                    value={cityValue}
                    onChange={(e) => setCityValue(e.target.value)}
                    className="min-h-[36px] flex-1 rounded-lg border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 text-sm text-[var(--vauto-text)] outline-none focus:border-[var(--vauto-primary)]"
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
                    onClick={() => void commitCity()}
                    disabled={!cityValue.trim()}
                    className="shrink-0 rounded-lg bg-[var(--vauto-primary)] px-3 text-xs font-bold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {requirements.missingAuth && (
        <p className="text-xs text-[var(--vauto-text-muted)]">
          Publikavimui reikia prisijungti prie paskyros.
        </p>
      )}
    </div>
  );
}

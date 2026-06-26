"use client";

import { Camera, ChevronLeft, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import type { AiExtractedListing } from "@/lib/types";
import { ADAPTIVE_CATEGORIES } from "@/lib/adaptive-categories/config";
import {
  SERVICE_CITIES,
  SERVICE_RADIUS_OPTIONS,
  SERVICE_SPECIALTIES,
} from "@/lib/service-catalog";
import { clearServiceListingDraft, saveServiceListingDraft } from "@/lib/listing-draft-storage";
import { capturePhoto } from "@/lib/native-media";
import { LithuanianCityField } from "@/components/listing/LithuanianCityField";
import { ListingPhotoRequiredBanner } from "@/components/listing/ListingPhotoRequiredBanner";
import {
  hasListingPhoto,
  isValidListingPhone,
  LISTING_PHOTO_REQUIRED_MESSAGE,
  sanitizeListingPhoneInput,
} from "@/lib/listing-form-validation";
import { isPlaceholderCity } from "@/lib/city-resolve";

const ACCENT = "#0f766e";
const TOTAL_STEPS = 4;
const SERVICE_OPTIONS = ADAPTIVE_CATEGORIES.services.fields.find((f) => f.key === "serviceList")?.options ?? [];

const STEP_TITLES = ["Paslauga ir kontaktai", "Aprašymas ir vieta", "Kaina ir patirtis", "Skelbti"] as const;

interface ServiceListingWizardProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  manualFallback?: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null }) => void;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
}

function attr(attrs: Record<string, string | string[] | undefined>, key: string): string {
  const v = attrs[key];
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}

function attrArray(attrs: Record<string, string | string[] | undefined>, key: string): string[] {
  const v = attrs[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split("||").map((s) => s.trim());
  return [];
}

export function ServiceListingWizard({
  draft,
  previewImage,
  manualFallback,
  onUpdate,
  onAttributeChange,
  onMediaChange,
  requestMediaConsent,
  onCancel,
  onPublish,
  onToast,
}: ServiceListingWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);
  const services = attrArray(attrs, "serviceList");

  const toggleService = (item: string) => {
    const next = services.includes(item) ? services.filter((s) => s !== item) : [...services, item];
    onAttributeChange("serviceList", next);
  };

  const can1 = Boolean(attr(attrs, "serviceSpecialty") && (draft.contact || user.phone));
  const can2 = Boolean(draft.location && (draft.description || draft.title));
  const can3 = draft.price > 0 && Boolean(attr(attrs, "experience"));
  const can4 = termsAccepted && Boolean(previewImage);

  const canNext = [false, can1, can2, can3, can4][step];

  const handlePublish = () => {
    const phoneValue = draft.contact?.trim() || user.phone || "";
    if (!attr(attrs, "serviceSpecialty")) {
      onToast?.("Klaida: Pasirinkite paslaugos tipą.", "error");
      return;
    }
    if (!isValidListingPhone(phoneValue)) {
      onToast?.("Klaida: Įveskite telefono numerį.", "error");
      return;
    }
    if (isPlaceholderCity(draft.location) || draft.location.trim().length < 2) {
      onToast?.("Klaida: Pasirinkite miestą arba įrašykite gyvenvietę.", "error");
      return;
    }
    if (!draft.description?.trim()) {
      onToast?.("Klaida: Įveskite aprašymą.", "error");
      return;
    }
    if (!termsAccepted) {
      onToast?.("Klaida: Sutikite su portalo taisyklėmis.", "error");
      return;
    }
    if (!hasListingPhoto(previewImage)) {
      onToast?.(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }
    const specialty = attr(attrs, "serviceSpecialty");
    onUpdate({
      category: "services",
      title: draft.title || specialty || "Paslaugos skelbimas",
      contact: phoneValue,
      priceLabel: `${draft.price}€/val`,
      attributes: { ...attrs, serviceSpecialty: specialty },
    });
    clearServiceListingDraft();
    onPublish();
  };

  const addPhoto = () => {
    requestMediaConsent(() => {
      void capturePhoto().then((photo) => {
        if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
        else onToast?.("Nuotraukos nepavyko", "error");
      });
    });
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell bg-[#f4f9ff]">
        <div className="mx-auto w-full max-w-2xl bg-white shadow-sm">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#cfe3ff] bg-white px-4 py-3">
          <button type="button" onClick={step > 1 ? () => setStep(step - 1) : onCancel} className="rounded-full p-2">
            {step > 1 ? <ChevronLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ACCENT }}>
              Paslaugos · {step}/{TOTAL_STEPS}
            </p>
            <p className="text-sm font-bold text-[#0f172a]">{STEP_TITLES[step - 1]}</p>
          </div>
          <div className="w-9" />
        </header>

        <div className="px-4 py-5">
          {step === 1 && (
            <>
              <label className="mb-1 block text-sm text-[#64748b]">Paslaugos tipas</label>
              <select
                value={attr(attrs, "serviceSpecialty")}
                onChange={(e) => onAttributeChange("serviceSpecialty", e.target.value)}
                className="mb-4 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              >
                <option value="">Pasirinkite...</option>
                {SERVICE_SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-sm text-[#64748b]">Skelbimo pavadinimas</label>
              <input
                value={draft.title}
                onChange={(e) => onUpdate({ title: e.target.value })}
                placeholder="pvz. Elektrikas — remontas ir montavimas"
                className="mb-4 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              />
              <label className="mb-1 block text-sm text-[#64748b]">Telefonas</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.contact || user.phone || "+370 "}
                onChange={(e) =>
                  onUpdate({ contact: sanitizeListingPhoneInput(e.target.value) })
                }
                placeholder="+370 600 00000"
                className="w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              />
            </>
          )}

          {step === 2 && (
            <>
              <label className="mb-1 block text-sm text-[#64748b]">Miestas</label>
              <div className="mb-4">
                <LithuanianCityField
                  location={draft.location ?? ""}
                  cityOptions={SERVICE_CITIES.filter((c) => c !== "Visoje Lietuvoje")}
                  onLocationChange={(city) => onUpdate({ location: city })}
                  selectClassName="w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
                  inputClassName="mt-2 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
                />
              </div>
              <label className="mb-1 block text-sm text-[#64748b]">Darbo spindulys</label>
              <select
                value={attr(attrs, "serviceRadius") || "25 km"}
                onChange={(e) => onAttributeChange("serviceRadius", e.target.value)}
                className="mb-4 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              >
                {SERVICE_RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-sm text-[#64748b]">Aprašymas</label>
              <textarea
                value={draft.description ?? ""}
                onChange={(e) => onUpdate({ description: e.target.value })}
                rows={5}
                placeholder="Kokias paslaugas teikiate, patirtis, darbo laikas..."
                className="w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              />
            </>
          )}

          {step === 3 && (
            <>
              <label className="mb-1 block text-sm text-[#64748b]">Kaina €/val.</label>
              <input
                type="number"
                value={draft.price || ""}
                onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
                className="mb-4 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              />
              <label className="mb-1 block text-sm text-[#64748b]">Patirtis</label>
              <input
                value={attr(attrs, "experience")}
                onChange={(e) => onAttributeChange("experience", e.target.value)}
                placeholder="pvz. 8 metai"
                className="mb-4 w-full rounded-xl border border-[#cfe3ff] px-3 py-3 text-sm"
              />
              <p className="mb-2 text-sm text-[#64748b]">Teikiamos paslaugos</p>
              <div className="flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleService(item)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      services.includes(item)
                        ? "text-white"
                        : "border border-[#cfe3ff] text-[#64748b]"
                    }`}
                    style={services.includes(item) ? { backgroundColor: ACCENT } : undefined}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <ListingPhotoRequiredBanner visible={!hasListingPhoto(previewImage)} />
              <div className="mb-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={addPhoto}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cfe3ff] text-[#64748b]"
                >
                  {previewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewImage} alt="" className="h-full w-full rounded-xl object-cover" />
                  ) : (
                    <>
                      <Camera className="h-6 w-6" />
                      <span className="mt-1 text-[10px]">Nuotrauka</span>
                    </>
                  )}
                </button>
                <div className="min-w-0 flex-1 text-sm text-[#64748b]">
                  <p className="font-semibold text-[#0f172a]">{draft.title || attr(attrs, "serviceSpecialty")}</p>
                  <p className="mt-1">{draft.location}</p>
                  <p className="mt-1">{draft.price > 0 ? `${draft.price}€/val` : "Kaina nenurodyta"}</p>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-[#64748b]">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1"
                />
                Sutinku su paslaugų skelbimų taisyklėmis ir privatumo politika.
              </label>
              {manualFallback && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Automatinis atpažinimas nepavyko — patikrinkite laukus prieš publikuojant.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="sticky bottom-0 border-t border-[#cfe3ff] bg-white px-4 py-4">
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => {
                saveServiceListingDraft({ ...draft, attributes: attrs }, previewImage);
                setStep(step + 1);
              }}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              Toliau
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePublish}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              Publikuoti paslaugą
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

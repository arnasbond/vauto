"use client";

import { ListingPublishSocialOptions } from "@/components/seller/ListingPublishSocialOptions";
import { Camera, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiExtractedListing } from "@/lib/types";
import { getVehicleStepMissingKeys } from "@/lib/listing-field-validation";
import { WizardFooter } from "@/components/wizard/WizardFieldKit";
import { CreatableCombobox } from "@/components/wizard/CreatableCombobox";
import { VISION_RECOGNITION_FAILED_MESSAGE } from "@/lib/ai-safeguards";
import {
  BODY_TYPES,
  COLOR_OPTIONS,
  DEFECT_OPTIONS,
  DOOR_COUNTS,
  DRIVE_TYPES,
  engineCcSuggestions,
  FUEL_TYPES,
  GEARBOX_TYPES,
  modelsForMake,
  modificationsFor,
  powerKwSuggestions,
  REGISTRATION_MONTHS,
  REGISTRATION_YEARS,
  STEERING_OPTIONS,
  vehicleSummaryLabel,
  VEHICLE_MAKES,
  VEHICLE_EQUIPMENT_OPTIONS,
  type VehicleModification,
} from "@/lib/vehicle-catalog";
import {
  lookupVehicle,
  vehicleLookupToDraftPatch,
} from "@/lib/vehicle-intelligence/vehicle-lookup";
import {
  applyFirstGalleryFile,
  ListingGalleryFileInput,
} from "@/components/listing/ListingGalleryFileInput";
import { parseVideoUrl } from "@/lib/video-url";
import { isValidVin } from "@/lib/trust";
import { LithuanianCityField } from "@/components/listing/LithuanianCityField";
import { ListingWizardStrip } from "@/components/wizard/ListingWizardStrip";
import { useListingWizard } from "@/hooks/useListingWizard";
import { isPlaceholderCity } from "@/lib/city-resolve";
import { LT_CITIES } from "@/lib/general-catalog";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { ZeroUiPaymentGate } from "@/components/zero-ui/ZeroUiPaymentGate";

const TOTAL_STEPS = 7;

const STEP_TITLES = [
  "Markė, modelis, VIN kodas",
  "Nuotraukos, video",
  "Automobilio duomenys",
  "Modifikacija ir būklė",
  "Kaina",
  "Vieta ir aprašymas",
  "Peržiūra ir publikavimas",
] as const;

interface VehicleListingWizardProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  videoUrl: string;
  manualFallback?: boolean;
  userPrompt?: string | null;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null; videoUrl?: string }) => void;
  onPhotoCaptured?: (dataUrl: string) => void | Promise<void>;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
  embedded?: boolean;
}

function attr(attrs: Record<string, string | string[] | undefined>, key: string): string {
  const v = attrs[key];
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
}

function attrArray(attrs: Record<string, string | string[] | undefined>, key: string): string[] {
  const v = attrs[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim());
  return [];
}

function ChipRow({
  label,
  required,
  options,
  value,
  onChange,
  invalid,
}: {
  label: string;
  required?: boolean;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className={`mb-4 ${invalid ? "nt-wizard-field-invalid rounded-md p-1" : ""}`}>
      <label className="nt-wizard-label mb-2 block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`nt-wizard-chip shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              value === opt ? "nt-wizard-chip-active" : ""
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
  placeholder = "Pasirinkite",
  invalid,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <div className={`mb-4 ${invalid ? "nt-wizard-field-invalid rounded-md p-1" : ""}`}>
      <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="nt-wizard-input w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[#1167b1] focus:ring-1 focus:ring-[#1167b1]"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function ProgressHeader({
  step,
  summary,
  title,
  onClose,
}: {
  step: number;
  summary: string;
  title: string;
  onClose: () => void;
}) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="mb-6 flex items-start gap-4">
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--portal-progress, #1167b1) ${pct}%, #e5e7eb ${pct}%)`,
        }}
      >
        <div className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-white text-center">
          <span className="text-sm font-bold leading-none text-[var(--portal-accent,#1167b1)]">{step}</span>
          <span className="text-[10px] text-[#9ca3af]">/ {TOTAL_STEPS}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {summary && (
          <p className="truncate text-sm font-semibold text-[#111827]">{summary}</p>
        )}
        <p className="text-sm text-[#6b7280]">{title}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full p-1.5 text-[#6b7280] hover:bg-[#f3f4f6]"
        aria-label="Atšaukti"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

export function VehicleListingWizard({
  draft,
  previewImage,
  videoUrl,
  manualFallback,
  userPrompt,
  onUpdate,
  onAttributeChange,
  onMediaChange,
  onPhotoCaptured,
  requestMediaConsent,
  onCancel,
  onPublish,
  embedded = false,
}: VehicleListingWizardProps) {
  const [step, setStep] = useState(1);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);
  const make = attr(attrs, "make");
  const model = attr(attrs, "model");
  const year = attr(attrs, "year");
  const summary = vehicleSummaryLabel(attrs);

  const models = useMemo(() => {
    const base = modelsForMake(make);
    if (model && !base.includes(model)) {
      return [...base.filter((m) => m !== "Kita"), model, "Kita"];
    }
    return base;
  }, [make, model]);
  const modifications = useMemo(
    () => modificationsFor(make, model),
    [make, model]
  );
  const ccSuggestions = useMemo(
    () => engineCcSuggestions(make, model),
    [make, model]
  );
  const kwSuggestions = useMemo(
    () => powerKwSuggestions(make, model),
    [make, model]
  );
  const vehicleOptions = attrArray(attrs, "vehicleOptions");

  const toggleVehicleOption = useCallback(
    (opt: string) => {
      const next = vehicleOptions.includes(opt)
        ? vehicleOptions.filter((o) => o !== opt)
        : [...vehicleOptions, opt];
      onAttributeChange("vehicleOptions", next);
    },
    [vehicleOptions, onAttributeChange]
  );

  const applyModification = useCallback(
    (mod: VehicleModification) => {
      onAttributeChange("modification", mod.label);
      onAttributeChange("bodyType", mod.bodyType);
      onAttributeChange("fuelType", mod.fuelType);
      onAttributeChange("doors", mod.doors);
      onAttributeChange("engine", mod.label);
      if (mod.engineCc) onAttributeChange("engineCc", mod.engineCc);
      if (mod.powerKw) onAttributeChange("powerKw", mod.powerKw);
    },
    [onAttributeChange]
  );

  const runVinLookup = useCallback(
    (vinValue: string) => {
      void lookupVehicle(vinValue, { make, model }).then((lookup) => {
        const patch = vehicleLookupToDraftPatch(lookup);
        onUpdate({
          ...patch,
          attributes: { ...attrs, ...patch.attributes, vin: vinValue },
        });
      });
    },
    [attrs, make, model, onUpdate]
  );

  const canNextStep1 = Boolean(make && model && year);
  const canNextStep2 = Boolean(previewImage);
  const canNextStep3 =
    Boolean(attr(attrs, "bodyType") && attr(attrs, "fuelType") && attr(attrs, "gearbox") && attr(attrs, "doors"));
  const canNextStep4 =
    Boolean(attr(attrs, "defects") && attr(attrs, "color") && attr(attrs, "mileage"));
  const canNextStep5 = draft.price > 0;
  const canNextStep6 =
    !isPlaceholderCity(draft.location) && draft.location.trim().length >= 2;

  const stepMissingKeys = useMemo(
    () => getVehicleStepMissingKeys(step, attrs),
    [step, attrs]
  );
  const fieldInvalid = (key: string) =>
    showStepErrors && stepMissingKeys.includes(key);

  const canNext = [
    false,
    canNextStep1,
    canNextStep2,
    canNextStep3,
    canNextStep4,
    canNextStep5,
    canNextStep6,
    true,
  ][step];

  const goNext = () => {
    if (step === 4) {
      const modLabel = attr(attrs, "modification");
      const cc = attr(attrs, "engineCc");
      const kw = attr(attrs, "powerKw");
      if (!attr(attrs, "engine")) {
        if (modLabel) onAttributeChange("engine", modLabel);
        else if (cc && kw) onAttributeChange("engine", `${cc} cm³ · ${kw} kW`);
        else if (cc) onAttributeChange("engine", `${cc} cm³`);
      }
    }
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else onPublish();
  };

  const goBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const syncTitle = useCallback(() => {
    if (make && model) {
      onUpdate({
        title: `${make} ${model}${year ? ` ${year}` : ""}`.trim(),
        category: "vehicles",
      });
    }
  }, [make, model, onUpdate, year]);

  useEffect(() => {
    if (make && model && year) syncTitle();
  }, [make, model, year, syncTitle]);

  const aiPrefilledStep1 = Boolean(make && model && year && userPrompt?.trim());

  const { pendingMicroPayment, clearMicroPayment, setActiveBoost } = useZeroUiScreen();

  const { analysis, buddyMessage, thread, handleWizardReply } = useListingWizard({
    draft,
    userPrompt,
    manualFallback,
    onUpdate,
    onAttributeChange,
    onFocusVin: () => setStep(1),
  });

  useEffect(() => {
    if (!embedded) window.scrollTo(0, 0);
    setShowStepErrors(false);
  }, [embedded, step]);

  if (pendingMicroPayment) {
    return (
      <div
        className={
          embedded
            ? "chameleon-wizard-shell rounded-2xl border border-[#e5e7eb] bg-[var(--portal-wizard-surface,#fff)] p-4 shadow-sm"
            : "listing-wizard-overlay chameleon-wizard-shell flex items-center justify-center p-4"
        }
      >
        <ZeroUiPaymentGate
          embedded
          intent={pendingMicroPayment}
          onCancel={clearMicroPayment}
          onSuccess={() => {
            setActiveBoost(true);
            clearMicroPayment();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "chameleon-wizard-shell rounded-2xl border border-[var(--vauto-border,#e5e7eb)] bg-[var(--portal-wizard-surface,#fff)] shadow-sm"
          : "listing-wizard-overlay chameleon-wizard-shell"
      }
    >
      <div
        className={
          embedded
            ? "px-4 py-5"
            : "mx-auto min-h-full w-full max-w-lg px-4 py-5 pb-6 shadow-sm"
        }
      >
        <ProgressHeader
          step={step}
          summary={step > 1 ? summary : make || ""}
          title={STEP_TITLES[step - 1]}
          onClose={onCancel}
        />

        {!manualFallback && step <= 2 && (
          <ListingWizardStrip
            intro={buddyMessage}
            questions={analysis.questions}
            thread={thread}
            quickReplies={analysis.quickReplies}
            onWizardReply={handleWizardReply}
          />
        )}

        {manualFallback && (step === 1 || step === 2) && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {VISION_RECOGNITION_FAILED_MESSAGE}. Pasirinkite markę, kategoriją ir kitus laukus
            žemiau.
          </p>
        )}

        {step === 1 && (
          <>
            {aiPrefilledStep1 && (
              <p className="mb-4 rounded-lg border border-[#bfdbfe] bg-[#eef6ff] px-3 py-2 text-xs text-[#1e40af]">
                AI iš balso užpildė markę, modelį ir metus — patikrinkite ir tęskite.
              </p>
            )}
            <CreatableCombobox
              label="Markė"
              required
              value={make}
              onChange={(v) => {
                onAttributeChange("make", v);
                onAttributeChange("model", "");
              }}
              options={[...VEHICLE_MAKES]}
              invalid={fieldInvalid("make")}
            />
            <CreatableCombobox
              label="Modelis"
              required
              value={model}
              onChange={(v) => onAttributeChange("model", v)}
              options={models}
              placeholder={make ? "Ieškoti arba įrašyti modelį…" : "Pirma pasirinkite markę"}
              disabled={!make}
              invalid={fieldInvalid("model")}
            />
            <div className="mb-4 grid grid-cols-2 gap-3">
              <SelectField
                label="Pirmos registracijos metai"
                required
                value={year}
                onChange={(v) => onAttributeChange("year", v)}
                options={REGISTRATION_YEARS}
                placeholder="Metai"
                invalid={fieldInvalid("year")}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                  Mėnuo
                </label>
                <select
                  value={attr(attrs, "registrationMonth")}
                  onChange={(e) => onAttributeChange("registrationMonth", e.target.value)}
                  className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2.5 text-sm"
                >
                  {REGISTRATION_MONTHS.map((m) => (
                    <option key={m.value || "empty"} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="my-4 text-center text-sm text-[#9ca3af]">— arba —</p>

            <div className="mb-4 rounded-lg bg-[#ecfdf5] px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[#059669]">
                Paprasta ir greita!
              </p>
              <p className="mt-1 text-xs text-[#065f46]">
                Nurodžius VIN kodą, dalis skelbimo informacijos gali būti užpildoma
                automatiškai.
              </p>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                Kėbulo numeris (VIN)
              </label>
              <input
                type="text"
                value={attr(attrs, "vin")}
                onChange={(e) => onAttributeChange("vin", e.target.value.toUpperCase())}
                onBlur={() => {
                  const vin = attr(attrs, "vin");
                  if (isValidVin(vin)) runVinLookup(vin);
                }}
                placeholder="17 simbolių VIN"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm uppercase tracking-wide"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <ListingGalleryFileInput
              requestConsent={requestMediaConsent}
              maxFiles={60}
              className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1167b1] bg-[#f0f7ff] py-10 text-[#1167b1]"
              label="Įkelti nuotrauką"
              onFilesSelected={(files) => {
                applyFirstGalleryFile(files, (dataUrl) => {
                  onMediaChange({ imageDataUrl: dataUrl });
                  void onPhotoCaptured?.(dataUrl);
                });
              }}
            />
            {previewImage && (
              <div className="mb-4 overflow-hidden rounded-xl border border-[#e5e7eb]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewImage} alt="Peržiūra" className="max-h-48 w-full object-cover" />
              </div>
            )}
            <p className="mb-4 text-xs text-[#6b7280]">
              Galite įkelti iki 60 nuotraukų. Rekomenduojami formatai: JPG, PNG, WEBP.
            </p>
            <div className="mb-4">
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[#374151]">
                <Camera className="h-4 w-4" />
                Įkelkite video (YouTube)
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => onMediaChange({ videoUrl: e.target.value })}
                placeholder="https://youtube.com/..."
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                Kėbulo numeris (VIN)
              </label>
              <input
                type="text"
                value={attr(attrs, "vin")}
                onChange={(e) => onAttributeChange("vin", e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm uppercase"
              />
            </div>
            <ChipRow
              label="Kėbulo tipas"
              required
              options={BODY_TYPES}
              value={attr(attrs, "bodyType")}
              onChange={(v) => onAttributeChange("bodyType", v)}
              invalid={fieldInvalid("bodyType")}
            />
            <ChipRow
              label="Kuro tipas"
              required
              options={FUEL_TYPES}
              value={attr(attrs, "fuelType")}
              onChange={(v) => onAttributeChange("fuelType", v)}
              invalid={fieldInvalid("fuelType")}
            />
            <ChipRow
              label="Pavarų dėžė"
              required
              options={GEARBOX_TYPES}
              value={attr(attrs, "gearbox")}
              onChange={(v) => onAttributeChange("gearbox", v)}
              invalid={fieldInvalid("gearbox")}
            />
            <ChipRow
              label="Varantieji ratai"
              options={DRIVE_TYPES}
              value={attr(attrs, "driveType")}
              onChange={(v) => onAttributeChange("driveType", v)}
            />
            <ChipRow
              label="Durų skaičius"
              required
              options={DOOR_COUNTS}
              value={attr(attrs, "doors")}
              onChange={(v) => onAttributeChange("doors", v)}
              invalid={fieldInvalid("doors")}
            />
          </>
        )}

        {step === 4 && (
          <>
            {modifications.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-[#374151]">
                  Pasirinkite modifikaciją ({modifications.length})
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-[#e5e7eb]">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#f9fafb] text-[#6b7280]">
                      <tr>
                        <th className="px-2 py-1.5">Pavadinimas</th>
                        <th className="px-2 py-1.5">Kuras</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modifications.map((mod) => (
                        <tr
                          key={mod.id}
                          className={`cursor-pointer border-t border-[#f3f4f6] hover:bg-[#eff6ff] ${
                            attr(attrs, "modification") === mod.label ? "bg-[#dbeafe]" : ""
                          }`}
                          onClick={() => applyModification(mod)}
                        >
                          <td className="px-2 py-2 font-medium">{mod.label}</td>
                          <td className="px-2 py-2">{mod.fuelType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <SelectField
              label="Defektai"
              required
              value={attr(attrs, "defects")}
              onChange={(v) => onAttributeChange("defects", v)}
              options={[...DEFECT_OPTIONS]}
              invalid={fieldInvalid("defects")}
            />
            <SelectField
              label="Spalva"
              required
              value={attr(attrs, "color")}
              onChange={(v) => onAttributeChange("color", v)}
              options={[...COLOR_OPTIONS]}
              invalid={fieldInvalid("color")}
            />
            <div className={`mb-4 ${fieldInvalid("mileage") ? "nt-wizard-field-invalid rounded-md p-1" : ""}`}>
              <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                Rida <span className="text-red-500">*</span>
              </label>
              <div className="flex">
                <input
                  type="text"
                  inputMode="numeric"
                  value={attr(attrs, "mileage").replace(/\s*km/i, "")}
                  onChange={(e) =>
                    onAttributeChange("mileage", e.target.value ? `${e.target.value} km` : "")
                  }
                  placeholder="185000"
                  className="nt-wizard-input min-w-0 flex-1 rounded-l-lg border px-3 py-2.5 text-sm"
                />
                <span className="nt-wizard-muted flex items-center rounded-r-lg border border-l-0 px-3 text-sm">
                  km
                </span>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                Darbinis tūris, cm³
              </label>
              <input
                type="text"
                value={attr(attrs, "engineCc")}
                onChange={(e) => onAttributeChange("engineCc", e.target.value)}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
              {ccSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-[#6b7280]">arba pasirinkite:</span>
                  {ccSuggestions.map((cc) => (
                    <button
                      key={cc}
                      type="button"
                      onClick={() => onAttributeChange("engineCc", cc)}
                      className="rounded-full border border-[#d1d5db] px-2.5 py-1 text-xs hover:border-[#1167b1]"
                    >
                      {cc} cm³
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Galia</label>
              <div className="flex">
                <input
                  type="text"
                  value={attr(attrs, "powerKw")}
                  onChange={(e) => onAttributeChange("powerKw", e.target.value)}
                  className="min-w-0 flex-1 rounded-l-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
                />
                <span className="flex items-center rounded-r-lg border border-l-0 border-[#d1d5db] bg-[#f9fafb] px-3 text-sm text-[#6b7280]">
                  kW
                </span>
              </div>
              {kwSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {kwSuggestions.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => onAttributeChange("powerKw", kw)}
                      className="rounded-full border border-[#d1d5db] px-2.5 py-1 text-xs hover:border-[#1167b1]"
                    >
                      {kw} kW
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Galia (AG)</label>
              <div className="flex">
                <input
                  type="text"
                  inputMode="numeric"
                  value={attr(attrs, "powerHp")}
                  onChange={(e) => onAttributeChange("powerHp", e.target.value)}
                  placeholder="105"
                  className="min-w-0 flex-1 rounded-l-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
                />
                <span className="flex items-center rounded-r-lg border border-l-0 border-[#d1d5db] bg-[#f9fafb] px-3 text-sm text-[#6b7280]">
                  AG
                </span>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">SDK kodas</label>
              <input
                type="text"
                value={attr(attrs, "sdkCode")}
                onChange={(e) => onAttributeChange("sdkCode", e.target.value)}
                placeholder="SDK-123456"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-[#374151]">Papildomos opcijos (Autoplius)</p>
              <div className="space-y-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
                {VEHICLE_EQUIPMENT_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                    <input
                      type="checkbox"
                      checked={vehicleOptions.includes(opt)}
                      onChange={() => toggleVehicleOption(opt)}
                      className="h-4 w-4 accent-[#1167b1]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <ChipRow
              label="Vairo padėtis"
              required
              options={STEERING_OPTIONS}
              value={attr(attrs, "steering") || "Kairėje"}
              onChange={(v) => onAttributeChange("steering", v)}
            />
          </>
        )}

        {step === 5 && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-[#374151]">
              Kaina <span className="text-red-500">*</span>
            </label>
            <div className="flex">
              <input
                type="number"
                min={0}
                value={draft.price > 0 ? draft.price : ""}
                onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
                placeholder="5500"
                className="min-w-0 flex-1 rounded-l-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
              <span className="flex items-center rounded-r-lg border border-l-0 border-[#d1d5db] bg-[#f9fafb] px-3 text-sm text-[#6b7280]">
                €
              </span>
            </div>
          </div>
        )}

        {step === 6 && (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Vieta</label>
              <LithuanianCityField
                location={draft.location}
                cityOptions={LT_CITIES}
                onLocationChange={(city) => onUpdate({ location: city })}
                selectClassName="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
                inputClassName="mt-2 w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Kontaktas</label>
              <input
                type="text"
                value={draft.contact ?? ""}
                onChange={(e) => onUpdate({ contact: e.target.value })}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                TA galioja iki
              </label>
              <input
                type="month"
                value={attr(attrs, "taExpiry")}
                onChange={(e) => onAttributeChange("taExpiry", e.target.value)}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Aprašymas</label>
              <textarea
                rows={4}
                value={draft.description ?? ""}
                onChange={(e) => onUpdate({ description: e.target.value })}
                placeholder="Papildoma informacija apie automobilį…"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {step === 7 && (
          <div className="space-y-3 text-sm text-[#374151]">
            <p className="font-semibold text-[#111827]">{summary || draft.title}</p>
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImage} alt="" className="max-h-40 w-full rounded-lg object-cover" />
            )}
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-[#6b7280]">Kaina</dt>
              <dd className="font-medium">{draft.price} €</dd>
              <dt className="text-[#6b7280]">Rida</dt>
              <dd>{attr(attrs, "mileage") || "—"}</dd>
              <dt className="text-[#6b7280]">Kuras</dt>
              <dd>{attr(attrs, "fuelType") || "—"}</dd>
              <dt className="text-[#6b7280]">Vieta</dt>
              <dd>{draft.location}</dd>
            </dl>
            {videoUrl && parseVideoUrl(videoUrl).hasVideo && (
              <p className="text-xs text-[#1167b1]">✓ YouTube video pridėta</p>
            )}
            <ListingPublishSocialOptions className="mt-4" />
          </div>
        )}

        <WizardFooter
          showBack={step > 1}
          onBack={goBack}
          onNext={() => {
            if (!canNext && step < TOTAL_STEPS) {
              setShowStepErrors(true);
              return;
            }
            setShowStepErrors(false);
            if (step === 1) syncTitle();
            goNext();
          }}
          nextDisabled={!canNext && step < TOTAL_STEPS}
          nextLabel={step === TOTAL_STEPS ? "Publikuoti skelbimą" : "Toliau"}
          nextClassName="!bg-[#1167b1] !text-white hover:!bg-[#0d5a9a]"
        />
      </div>
    </div>
  );
}

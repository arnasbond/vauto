"use client";

import { ListingPublishSocialOptions } from "@/components/seller/ListingPublishSocialOptions";
import {
  Briefcase,
  Building2,
  Car,
  ChevronRight,
  ClipboardList,
  Clock,
  Globe,
  Home,
  MapPin,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiExtractedListing } from "@/lib/types";
import { getRealEstateStepMissingKeys } from "@/lib/listing-field-validation";
import { WizardFooter } from "@/components/wizard/WizardFieldKit";
import { CreatableCombobox } from "@/components/wizard/CreatableCombobox";
import {
  BUILDING_TYPES,
  defaultTransactionForType,
  FEATURE_OPTIONS,
  FURNISHING_OPTIONS,
  HEATING_OPTIONS,
  HOUSE_TYPES,
  isLandPropertyType,
  LAND_PURPOSE_OPTIONS,
  LAND_UTILITY_OPTIONS,
  microdistrictsFor,
  MUNICIPALITIES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  propertyTypeNeedsAction,
  realEstateSummaryLabel,
  ROOM_QUICK,
  SELLER_ROLES,
  settlementsFor,
  streetsFor,
  TRANSACTION_TYPES,
  buildLocationString,
  type PropertyTypeId,
} from "@/lib/real-estate-catalog";
import { ListingGalleryFileInput } from "@/components/listing/ListingGalleryFileInput";
import { parseVideoUrl } from "@/lib/video-url";

const ACCENT = "#c62828";
const TOTAL_STEPS = 7;

const STEP_TITLES = [
  "Pasirinkite objekto tipą",
  "Pasirinkite veiksmą",
  "Vieta",
  "Objekto duomenys",
  "Kambariai ir šildymas",
  "Nuotraukos ir aprašymas",
  "Kaina ir publikavimas",
] as const;

interface RealEstateListingWizardProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  videoUrl: string;
  manualFallback?: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null; videoUrl?: string }) => void;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
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

const TYPE_ICONS: Record<string, ReactNode> = {
  building: <Building2 className="h-6 w-6 text-[#9e9e9e]" />,
  home: <Home className="h-6 w-6 text-[#9e9e9e]" />,
  plot: <MapPin className="h-6 w-6 text-[#9e9e9e]" />,
  commercial: <Briefcase className="h-6 w-6 text-[#9e9e9e]" />,
  garage: <Car className="h-6 w-6 text-[#9e9e9e]" />,
  short: <Clock className="h-6 w-6 text-[#9e9e9e]" />,
  search: <Search className="h-6 w-6 text-[#9e9e9e]" />,
  globe: <Globe className="h-6 w-6 text-[#9e9e9e]" />,
};

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
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`nt-wizard-chip shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition ${
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

function ProgressHeader({
  step,
  breadcrumb,
  title,
  onClose,
  onChangeType,
}: {
  step: number;
  breadcrumb: string;
  title: string;
  onClose: () => void;
  onChangeType?: () => void;
}) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="nt-wizard-header mb-5 border-b pb-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#c62828]">
          Naujas skelbimas
        </span>
        <button
          type="button"
          onClick={onClose}
          className="nt-wizard-muted rounded-full p-1.5 hover:bg-[color-mix(in_srgb,var(--portal-text)_8%,transparent)]"
          aria-label="Atšaukti"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-start gap-4">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ACCENT} ${pct}%, var(--vauto-border, #e0e0e0) ${pct}%)`,
          }}
        >
          <div className="nt-wizard-panel flex h-9 w-9 flex-col items-center justify-center rounded-full text-center">
            <span className="text-xs font-bold leading-none text-[#c62828]">{step}</span>
            <span className="nt-wizard-muted text-[9px]">/ {TOTAL_STEPS}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {breadcrumb && (
            <div className="flex items-center gap-2">
              <p className="nt-wizard-muted truncate text-xs font-semibold uppercase">{breadcrumb}</p>
              {onChangeType && (
                <button
                  type="button"
                  onClick={onChangeType}
                  className="shrink-0 text-xs font-medium text-[#c62828] hover:underline"
                >
                  Keisti
                </button>
              )}
            </div>
          )}
          <p className="nt-wizard-heading text-base font-bold">{title}</p>
        </div>
      </div>
    </div>
  );
}

export function RealEstateListingWizard({
  draft,
  previewImage,
  videoUrl,
  manualFallback,
  onUpdate,
  onAttributeChange,
  onMediaChange,
  requestMediaConsent,
  onCancel,
  onPublish,
}: RealEstateListingWizardProps) {
  const [step, setStep] = useState(1);
  const [showFeatures, setShowFeatures] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);

  const propertyType = attr(attrs, "propertyType") as PropertyTypeId | "";
  const transactionType = attr(attrs, "transactionType");
  const municipality = attr(attrs, "municipality");
  const settlement = attr(attrs, "settlement");
  const summary = realEstateSummaryLabel(attrs);
  const skipActionStep = Boolean(propertyType && !propertyTypeNeedsAction(propertyType));

  const settlements = useMemo(() => settlementsFor(municipality), [municipality]);
  const microdistricts = useMemo(() => microdistrictsFor(settlement), [settlement]);
  const streets = useMemo(() => streetsFor(settlement), [settlement]);
  const heating = attrArray(attrs, "heating");
  const features = attrArray(attrs, "features");
  const landUtilities = attrArray(attrs, "landUtilities");

  const toggleLandUtility = useCallback(
    (opt: string) => {
      const next = landUtilities.includes(opt)
        ? landUtilities.filter((u) => u !== opt)
        : [...landUtilities, opt];
      onAttributeChange("landUtilities", next);
    },
    [landUtilities, onAttributeChange]
  );

  const breadcrumb = useMemo(() => {
    if (!propertyType) return "";
    const base = PROPERTY_TYPE_LABELS[propertyType as PropertyTypeId] ?? "";
    const tx = transactionType ? ` ${transactionType.toUpperCase()}I` : "";
    return `${base}${tx}`;
  }, [propertyType, transactionType]);

  const progressStep = skipActionStep && step > 1 ? step - 1 : step;

  const toggleHeating = useCallback(
    (opt: string) => {
      const next = heating.includes(opt)
        ? heating.filter((h) => h !== opt)
        : [...heating, opt];
      onAttributeChange("heating", next);
    },
    [heating, onAttributeChange]
  );

  const toggleFeature = useCallback(
    (opt: string) => {
      const next = features.includes(opt)
        ? features.filter((f) => f !== opt)
        : [...features, opt];
      onAttributeChange("features", next);
      onAttributeChange("ntFeatures", next);
    },
    [features, onAttributeChange]
  );

  const syncTitleAndLocation = () => {
    const loc = buildLocationString(attrs);
    if (loc) onUpdate({ location: loc });
    const typeLabel = PROPERTY_TYPES.find((p) => p.id === propertyType)?.label ?? "";
    if (typeLabel) {
      const rooms = attr(attrs, "rooms");
      const area = attr(attrs, "area");
      onUpdate({
        title: [typeLabel, transactionType, rooms ? `${rooms} kamb.` : "", area ? `${area} m²` : ""]
          .filter(Boolean)
          .join(" · "),
        category: "real_estate",
      });
    }
  };

  const canNextStep1 = Boolean(propertyType);
  const canNextStep2 = Boolean(transactionType);
  const canNextStep3 = Boolean(municipality && settlement);
  const canNextStep4 =
    isLandPropertyType(propertyType)
      ? Boolean(
          attr(attrs, "area") ||
            attr(attrs, "landArea") ||
            attr(attrs, "plotArea")
        )
      : Boolean(attr(attrs, "area") && (attr(attrs, "furnishing") || attr(attrs, "condition")));
  const canNextStep5 =
    isLandPropertyType(propertyType)
      ? true
      : Boolean(attr(attrs, "rooms") && heating.length > 0);
  const canNextStep6 = Boolean(previewImage || draft.description?.trim());
  const canNextStep7 = draft.price > 0 && draft.contact?.trim() && termsAccepted;

  const canNext = [
    false,
    canNextStep1,
    canNextStep2,
    canNextStep3,
    canNextStep4,
    canNextStep5,
    canNextStep6,
    canNextStep7,
  ][step];

  const goNext = () => {
    if (step === 3) syncTitleAndLocation();
    if (step < TOTAL_STEPS) {
      let next = step + 1;
      if (next === 2 && skipActionStep) next = 3;
      setStep(next);
    } else {
      syncTitleAndLocation();
      onPublish();
    }
  };

  const goBack = () => {
    if (step > 1) {
      let prev = step - 1;
      if (prev === 2 && skipActionStep) prev = 1;
      setStep(prev);
    }
  };

  const selectPropertyType = (typeId: PropertyTypeId) => {
    const tx = defaultTransactionForType(typeId);
    onUpdate({
      attributes: {
        ...attrs,
        propertyType: typeId,
        transactionType: tx,
      },
    });
    setStep(propertyTypeNeedsAction(typeId) ? 2 : 3);
  };

  const selectTransactionType = (tx: (typeof TRANSACTION_TYPES)[number]) => {
    onAttributeChange("transactionType", tx);
    setStep(3);
  };

  const selectFurnishing = (value: string) => {
    onUpdate({
      attributes: {
        ...attrs,
        furnishing: value,
        condition: value,
      },
    });
  };

  const furnishingValue =
    attr(attrs, "furnishing") || attr(attrs, "condition");

  const isApartment = propertyType === "butas";
  const isHouse = propertyType === "namas";
  const isLandPlot = isLandPropertyType(propertyType);

  const stepMissingKeys = useMemo(
    () =>
      getRealEstateStepMissingKeys(step, attrs, {
        previewImage,
        description: draft.description,
        price: draft.price,
        contact: draft.contact,
        termsAccepted,
      }),
    [step, attrs, previewImage, draft.description, draft.price, draft.contact, termsAccepted]
  );

  const fieldInvalid = (key: string) =>
    showStepErrors && stepMissingKeys.includes(key);

  const handleNext = () => {
    if (!canNext && step < TOTAL_STEPS) {
      setShowStepErrors(true);
      return;
    }
    setShowStepErrors(false);
    goNext();
  };

  const stepTitle = STEP_TITLES[step - 1];

  useEffect(() => {
    window.scrollTo(0, 0);
    setShowStepErrors(false);
  }, [step]);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell">
        <div className="mx-auto w-full max-w-lg px-4 py-4 pb-6 shadow-sm">
        <ProgressHeader
          step={progressStep}
          breadcrumb={step > 1 ? breadcrumb : ""}
          title={stepTitle}
          onClose={onCancel}
          onChangeType={step > 2 ? () => setStep(1) : undefined}
        />

        {manualFallback && step === 1 && (
          <p className="mb-4 rounded-md border border-[#ffe082] bg-[#fffde7] px-3 py-2 text-xs text-[#5d4037]">
            AI nepavyko pilnai atpažinti — pasirinkite objekto tipą ranka.
          </p>
        )}

        {step === 1 && (
          <ul className="nt-wizard-panel relative z-10 divide-y overflow-hidden rounded-md border">
            {PROPERTY_TYPES.map((pt) => (
              <li key={pt.id}>
                <button
                  type="button"
                  onClick={() => selectPropertyType(pt.id)}
                  className={`nt-wizard-option-row relative z-10 flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition ${
                    propertyType === pt.id ? "nt-wizard-option-row-selected" : ""
                  }`}
                >
                  {TYPE_ICONS[pt.icon]}
                  <span className="nt-wizard-heading flex-1 text-sm font-medium">{pt.label}</span>
                  <ChevronRight className="h-4 w-4 text-[#bdbdbd]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 2 && (
          <ul className="nt-wizard-panel relative z-10 divide-y overflow-hidden rounded-md border">
            {TRANSACTION_TYPES.map((tx) => (
              <li key={tx}>
                <button
                  type="button"
                  onClick={() => selectTransactionType(tx)}
                  className={`nt-wizard-option-row relative z-10 flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition ${
                    transactionType === tx ? "nt-wizard-option-row-selected" : ""
                  }`}
                >
                  {tx === "Pardavimui" ? (
                    <Building2 className="nt-wizard-muted h-6 w-6" />
                  ) : (
                    <Clock className="nt-wizard-muted h-6 w-6" />
                  )}
                  <span className="nt-wizard-heading text-sm font-medium">{tx}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-[#bdbdbd]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 3 && (
          <>
            <CreatableCombobox
              label="Savivaldybė"
              required
              value={municipality}
              onChange={(v) => {
                onAttributeChange("municipality", v);
                onAttributeChange("settlement", "");
                onAttributeChange("microdistrict", "");
                onAttributeChange("street", "");
              }}
              options={[...MUNICIPALITIES]}
              highlight
              invalid={stepMissingKeys.includes("municipality")}
            />
            <CreatableCombobox
              label="Gyvenvietė"
              required
              value={settlement}
              onChange={(v) => {
                onAttributeChange("settlement", v);
                onAttributeChange("microdistrict", "");
                onAttributeChange("street", "");
              }}
              options={settlements}
              highlight
              invalid={stepMissingKeys.includes("settlement")}
            />
            <CreatableCombobox
              label="Mikrorajonas"
              value={attr(attrs, "microdistrict")}
              onChange={(v) => onAttributeChange("microdistrict", v)}
              options={microdistricts}
              placeholder="Pasirinkite arba įrašykite mikrorajoną…"
            />
            <CreatableCombobox
              label="Gatvė"
              value={attr(attrs, "street")}
              onChange={(v) => onAttributeChange("street", v)}
              options={streets}
              placeholder="Pasirinkite arba įrašykite gatvę…"
            />
            <div className="mb-3 flex items-end gap-3">
              <div className="w-24">
                <label className="mb-1.5 block text-sm font-medium text-[#424242]">Namo numeris</label>
                <input
                  type="text"
                  value={attr(attrs, "houseNumber")}
                  onChange={(e) => onAttributeChange("houseNumber", e.target.value)}
                  className="w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm text-[#424242]">
                <input
                  type="checkbox"
                  checked={attr(attrs, "showHouseNumber") !== "false"}
                  onChange={(e) =>
                    onAttributeChange("showHouseNumber", e.target.checked ? "true" : "false")
                  }
                  className="h-4 w-4 rounded border-[#e0e0e0] accent-[#4caf50]"
                />
                Rodyti
              </label>
            </div>
            <div className="mb-3">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">
                Unikalus daikto numeris (RC numeris)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={attr(attrs, "rcNumber")}
                  onChange={(e) => onAttributeChange("rcNumber", e.target.value)}
                  placeholder="xxxx-xxxx-xxxx"
                  className="min-w-0 flex-1 rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
                />
                <label className="flex shrink-0 items-center gap-2 text-sm text-[#424242]">
                  <input
                    type="checkbox"
                    checked={attr(attrs, "showRcNumber") !== "false"}
                    onChange={(e) =>
                      onAttributeChange("showRcNumber", e.target.checked ? "true" : "false")
                    }
                    className="h-4 w-4 rounded border-[#e0e0e0] accent-[#4caf50]"
                  />
                  Rodyti
                </label>
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            {!isLandPlot && (
              <div className="mb-4">
                <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                  Bendras plotas <span className="text-red-600">*</span>
                </label>
                <div className="flex">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={attr(attrs, "area")}
                    onChange={(e) => onAttributeChange("area", e.target.value)}
                    placeholder="Pvz. 54"
                    className="nt-wizard-input min-w-0 flex-1 rounded-l-md border px-3 py-2.5 text-sm"
                  />
                  <span className="nt-wizard-muted flex items-center rounded-r-md border border-l-0 px-3 text-sm">
                    m²
                  </span>
                </div>
              </div>
            )}

            {isLandPlot && (
              <>
                <div className="mb-4">
                  <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                    Sklypo plotas <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={attr(attrs, "landArea") || attr(attrs, "plotArea") || attr(attrs, "area")}
                    onChange={(e) => {
                      const v = e.target.value;
                      onUpdate({
                        attributes: {
                          ...attrs,
                          landArea: v,
                          plotArea: v,
                          area: v,
                        },
                      });
                    }}
                    placeholder="Pvz. 12 a arba 0.5 ha"
                    className="nt-wizard-input w-full rounded-md border px-3 py-2.5 text-sm"
                  />
                </div>
                <ChipRow
                  label="Sklypo paskirtis"
                  options={LAND_PURPOSE_OPTIONS}
                  value={attr(attrs, "landPurpose")}
                  onChange={(v) => onAttributeChange("landPurpose", v)}
                />
                <div className="mb-4">
                  <p className="nt-wizard-label mb-2 text-sm font-medium">Komunikacijos</p>
                  <div className="nt-wizard-panel space-y-2 rounded-md border p-3">
                    {LAND_UTILITY_OPTIONS.map((opt) => (
                      <label key={opt} className="nt-wizard-label flex cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={landUtilities.includes(opt)}
                          onChange={() => toggleLandUtility(opt)}
                          className="h-4 w-4 accent-[#c62828]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {isHouse && (
              <div className="mb-4">
                <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                  Sklypo plotas (a)
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1">
                    <input
                      type="text"
                      value={attr(attrs, "plotArea")}
                      onChange={(e) => onAttributeChange("plotArea", e.target.value)}
                      disabled={attr(attrs, "noPlot") === "true"}
                      placeholder="Pvz. 8"
                      className="nt-wizard-input min-w-0 flex-1 rounded-l-md border px-3 py-2.5 text-sm disabled:opacity-50"
                    />
                    <span className="nt-wizard-muted flex items-center rounded-r-md border border-l-0 px-3 text-sm">
                      a
                    </span>
                  </div>
                  <label className="nt-wizard-label flex shrink-0 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={attr(attrs, "noPlot") === "true"}
                      onChange={(e) =>
                        onAttributeChange("noPlot", e.target.checked ? "true" : "false")
                      }
                      className="h-4 w-4 accent-[#4caf50]"
                    />
                    Be sklypo
                  </label>
                </div>
              </div>
            )}

            {isApartment && (
              <div className="mb-4">
                <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                  Aukštas (pvz. 2 / 5)
                </label>
                <input
                  type="text"
                  value={attr(attrs, "floor")}
                  onChange={(e) => onAttributeChange("floor", e.target.value)}
                  placeholder="2 / 5"
                  className="nt-wizard-input w-full rounded-md border px-3 py-2.5 text-sm"
                />
                <label className="nt-wizard-label mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={attr(attrs, "hasElevator") === "true"}
                    onChange={(e) =>
                      onAttributeChange("hasElevator", e.target.checked ? "true" : "false")
                    }
                    className="h-4 w-4 accent-[#4caf50]"
                  />
                  Yra liftas
                </label>
              </div>
            )}

            {isHouse && (
              <div className="mb-4">
                <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                  Aukštų skaičius pastate
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={attr(attrs, "floors")}
                  onChange={(e) => onAttributeChange("floors", e.target.value)}
                  placeholder="Pvz. 2"
                  className="nt-wizard-input w-full rounded-md border px-3 py-2.5 text-sm"
                />
              </div>
            )}

            {!isLandPlot && (
              <div className="mb-4 flex items-end gap-3">
                <div className="flex-1">
                  <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
                    Statybos metai
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={attr(attrs, "buildYear")}
                    onChange={(e) => onAttributeChange("buildYear", e.target.value)}
                    placeholder="Pvz. 2015"
                    className="nt-wizard-input w-full rounded-md border px-3 py-2.5 text-sm"
                  />
                </div>
                {isHouse && (
                  <label className="nt-wizard-label flex items-center gap-2 pb-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={attr(attrs, "renovated") === "true"}
                      onChange={(e) =>
                        onAttributeChange("renovated", e.target.checked ? "true" : "false")
                      }
                      className="h-4 w-4 accent-[#4caf50]"
                    />
                    Pastatas renovuotas
                  </label>
                )}
              </div>
            )}

            {isHouse && (
              <>
                <ChipRow
                  label="Namo tipas"
                  options={HOUSE_TYPES}
                  value={attr(attrs, "houseType")}
                  onChange={(v) => onAttributeChange("houseType", v)}
                />
                <ChipRow
                  label="Pastato tipas"
                  options={BUILDING_TYPES}
                  value={attr(attrs, "buildingType")}
                  onChange={(v) => onAttributeChange("buildingType", v)}
                />
              </>
            )}

            {!isLandPlot && (
              <ChipRow
                label="Įrengimas"
                required
                options={FURNISHING_OPTIONS}
                value={furnishingValue}
                onChange={selectFurnishing}
                invalid={fieldInvalid("furnishing")}
              />
            )}
          </>
        )}

        {step === 5 && (
          <>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-[#424242]">
                Kambarių sk. <span className="text-red-600">*</span>
              </label>
              <div className="flex gap-2">
                {ROOM_QUICK.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onAttributeChange("rooms", r)}
                    className={`flex-1 rounded-md border py-2.5 text-sm font-medium ${
                      attr(attrs, "rooms") === r
                        ? "border-[#c62828] bg-[#c62828] text-white"
                        : "border-[#e0e0e0] bg-white text-[#424242]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
                <input
                  type="text"
                  inputMode="numeric"
                  value={ROOM_QUICK.includes(attr(attrs, "rooms") as (typeof ROOM_QUICK)[number]) ? "" : attr(attrs, "rooms")}
                  onChange={(e) => onAttributeChange("rooms", e.target.value)}
                  placeholder="Įveskite"
                  className="w-20 rounded-md border border-[#e0e0e0] px-2 py-2.5 text-center text-sm"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-[#424242]">
                Šildymas <span className="text-red-600">*</span>
              </label>
              <div className="space-y-2 rounded-md border border-[#e0e0e0] bg-white p-3">
                {HEATING_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-3 text-sm text-[#424242]">
                    <input
                      type="checkbox"
                      checked={heating.includes(opt)}
                      onChange={() => toggleHeating(opt)}
                      className="h-4 w-4 rounded border-[#e0e0e0] accent-[#c62828]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFeatures((s) => !s)}
              className="mb-4 flex w-full items-center gap-3 rounded-md border border-[#e0e0e0] bg-white px-4 py-3 text-left text-sm font-medium text-[#424242] hover:bg-[#fafafa]"
            >
              <ClipboardList className="h-5 w-5 text-[#757575]" />
              Žymėti ypatumus
              {features.length > 0 && (
                <span className="ml-auto text-xs text-[#c62828]">({features.length})</span>
              )}
            </button>

            {showFeatures && (
              <div className="mb-4 space-y-2 rounded-md border border-[#e0e0e0] bg-[#fafafa] p-3">
                {FEATURE_OPTIONS.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-3 text-sm text-[#424242]">
                    <input
                      type="checkbox"
                      checked={features.includes(opt)}
                      onChange={() => toggleFeature(opt)}
                      className="h-4 w-4 accent-[#c62828]"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
          </>
        )}

        {step === 6 && (
          <>
            <button
              type="button"
              onClick={() => onUpdate({ description: draft.description ?? "" })}
              className="mb-3 flex w-full items-center gap-3 rounded-md border border-[#e0e0e0] bg-white px-4 py-3 text-left text-sm font-medium text-[#424242] hover:bg-[#fafafa]"
            >
              <Pencil className="h-5 w-5 text-[#757575]" />
              Aprašykite objektą
            </button>
            <textarea
              rows={4}
              value={draft.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Papildoma informacija apie objektą…"
              className="mb-4 w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
            />

            <p className="mb-2 text-xs text-[#757575]">
              Galite įkelti iki 50 nuotraukų. Maks. dydis 16 MB. Formatai: JPG, PNG, WEBP.
            </p>
            <ListingGalleryFileInput
              requestConsent={requestMediaConsent}
              maxFiles={50}
              className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#4caf50] bg-[#f1f8e9] px-4 py-8 text-[#2e7d32] hover:bg-[#e8f5e9]"
              label="Įkelkite nuotraukų (iki 50)"
              onFilesSelected={(files) => {
                const file = files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () =>
                  onMediaChange({ imageDataUrl: reader.result as string });
                reader.readAsDataURL(file);
              }}
            />
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewImage} alt="" className="mb-4 max-h-48 w-full rounded-md object-cover" />
            )}

            <div className="mb-3">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">Youtube nuoroda</label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => onMediaChange({ videoUrl: e.target.value })}
                placeholder="Įrašykite embed kodą arba nuorodą"
                className="w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">3D turas</label>
              <input
                type="url"
                value={attr(attrs, "tour3d")}
                onChange={(e) => onAttributeChange("tour3d", e.target.value)}
                placeholder="Įrašykite 3D nuorodą"
                className="w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">
                Kaina <span className="text-red-600">*</span>
              </label>
              <div className="flex">
                <input
                  type="number"
                  min={0}
                  value={draft.price > 0 ? draft.price : ""}
                  onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
                  className="min-w-0 flex-1 rounded-l-md border border-[#ffe082] bg-[#fffde7] px-3 py-3 text-sm"
                />
                <span className="flex items-center rounded-r-md border border-l-0 border-[#ffe082] bg-[#fffde7] px-3 text-sm text-[#757575]">
                  €
                </span>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">
                Telefono Nr. <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                value={draft.contact ?? "+370"}
                onChange={(e) => onUpdate({ contact: e.target.value })}
                className="w-full rounded-md border border-[#ffe082] bg-[#fffde7] px-3 py-3 text-sm"
              />
            </div>

            <ChipRow
              label="Jūs esate:"
              options={SELLER_ROLES}
              value={attr(attrs, "sellerRole") || "Privatus asmuo"}
              onChange={(v) => onAttributeChange("sellerRole", v)}
            />

            {/versl|tarpinink|vystytoj|statytoj/i.test(attr(attrs, "sellerRole")) && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-[#424242]">
                  Įmonės / verslo pavadinimas
                </label>
                <input
                  type="text"
                  name="organization"
                  autoComplete="organization"
                  value={attr(attrs, "companyName")}
                  onChange={(e) => onAttributeChange("companyName", e.target.value)}
                  placeholder="UAB Pavadinimas"
                  className="w-full rounded-md border border-[#e0e0e0] px-3 py-3 text-sm"
                />
              </div>
            )}

            <label className="mb-4 flex items-start gap-3 text-sm text-[#424242]">
              <input
                type="checkbox"
                checked={attr(attrs, "disableEmailContact") === "true"}
                onChange={(e) =>
                  onAttributeChange("disableEmailContact", e.target.checked ? "true" : "false")
                }
                className="mt-0.5 h-4 w-4 accent-[#c62828]"
              />
              Išjungti kontaktavimo el. paštu funkciją skelbime
            </label>

            <label className="mb-4 flex items-start gap-3 text-sm text-[#424242]">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#c62828]"
              />
              <span>
                Sutinku su{" "}
                <span className="font-medium text-[#c62828]">portalo taisyklėmis</span>
              </span>
            </label>

            <div className="rounded-md border border-[#e0e0e0] bg-[#fafafa] p-4 text-sm">
              <p className="font-bold text-[#212121]">{summary || draft.title}</p>
              {previewImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="" className="mt-3 max-h-36 w-full rounded-md object-cover" />
              )}
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <dt className="text-[#757575]">Kaina</dt>
                <dd className="font-medium">{draft.price > 0 ? `${draft.price} €` : "—"}</dd>
                <dt className="text-[#757575]">Plotas</dt>
                <dd>{attr(attrs, "area") ? `${attr(attrs, "area")} m²` : "—"}</dd>
                <dt className="text-[#757575]">Kambariai</dt>
                <dd>{attr(attrs, "rooms") || "—"}</dd>
                <dt className="text-[#757575]">Vieta</dt>
                <dd>{draft.location || buildLocationString(attrs) || "—"}</dd>
              </dl>
              {videoUrl && parseVideoUrl(videoUrl).hasVideo && (
                <p className="mt-2 text-xs text-[#c62828]">✓ YouTube video pridėta</p>
              )}
            </div>
            <ListingPublishSocialOptions className="mt-4" />
          </>
        )}

        <WizardFooter
          showBack={step > 1}
          onBack={goBack}
          onNext={handleNext}
          nextDisabled={!canNext && step < TOTAL_STEPS}
          nextLabel={step >= TOTAL_STEPS ? "Įvesti" : "Toliau"}
        />
      </div>
    </div>
  );
}

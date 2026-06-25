"use client";

import {
  Briefcase,
  Building2,
  Camera,
  Car,
  ChevronLeft,
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
import {
  BUILDING_TYPES,
  CONDITION_TYPES,
  defaultTransactionForType,
  FEATURE_OPTIONS,
  HEATING_OPTIONS,
  HOUSE_TYPES,
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
import { capturePhoto } from "@/lib/native-media";
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
}: {
  label: string;
  required?: boolean;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-sm font-medium text-[#424242]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition ${
              value === opt
                ? "border-[#c62828] bg-[#c62828] text-white"
                : "border-[#e0e0e0] bg-white text-[#424242] hover:border-[#c62828]"
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
  highlight,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  highlight?: boolean;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1.5 block text-sm font-medium text-[#424242]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none rounded-md border px-3 py-3 pr-10 text-sm text-[#212121] outline-none focus:border-[#c62828] focus:ring-1 focus:ring-[#c62828] ${
            highlight && !value ? "border-[#ffe082] bg-[#fffde7]" : "border-[#e0e0e0] bg-white"
          }`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-[#9e9e9e]" />
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
    <div className="mb-5 border-b border-[#e0e0e0] pb-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#c62828]">
          Naujas skelbimas
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-[#757575] hover:bg-[#f5f5f5]"
          aria-label="Atšaukti"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-start gap-4">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${ACCENT} ${pct}%, #e0e0e0 ${pct}%)`,
          }}
        >
          <div className="flex h-9 w-9 flex-col items-center justify-center rounded-full bg-white text-center">
            <span className="text-xs font-bold leading-none text-[#c62828]">{step}</span>
            <span className="text-[9px] text-[#9e9e9e]">/ {TOTAL_STEPS}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {breadcrumb && (
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-semibold uppercase text-[#757575]">{breadcrumb}</p>
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
          <p className="text-base font-bold text-[#212121]">{title}</p>
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
  const canNextStep4 = Boolean(attr(attrs, "area"));
  const canNextStep5 = Boolean(attr(attrs, "rooms") && heating.length > 0);
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

  const stepTitle = STEP_TITLES[step - 1];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell bg-[var(--portal-wizard-bg,#f5f5f5)]">
      <div className="listing-wizard-scroll">
        <div className="mx-auto min-h-full max-w-lg bg-[var(--portal-wizard-surface,#fff)] px-4 py-4 shadow-sm">
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
          <ul className="divide-y divide-[#e0e0e0] border border-[#e0e0e0] rounded-md overflow-hidden">
            {PROPERTY_TYPES.map((pt) => (
              <li key={pt.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAttributeChange("propertyType", pt.id);
                    onAttributeChange("transactionType", defaultTransactionForType(pt.id));
                  }}
                  className={`flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[#fafafa] ${
                    propertyType === pt.id ? "bg-[#ffebee]" : "bg-white"
                  }`}
                >
                  {TYPE_ICONS[pt.icon]}
                  <span className="flex-1 text-sm font-medium text-[#212121]">{pt.label}</span>
                  <ChevronRight className="h-4 w-4 text-[#bdbdbd]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 2 && (
          <ul className="divide-y divide-[#e0e0e0] border border-[#e0e0e0] rounded-md overflow-hidden">
            {TRANSACTION_TYPES.map((tx) => (
              <li key={tx}>
                <button
                  type="button"
                  onClick={() => onAttributeChange("transactionType", tx)}
                  className={`flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-[#fafafa] ${
                    transactionType === tx ? "bg-[#ffebee]" : "bg-white"
                  }`}
                >
                  {tx === "Pardavimui" ? (
                    <Building2 className="h-6 w-6 text-[#9e9e9e]" />
                  ) : (
                    <Clock className="h-6 w-6 text-[#9e9e9e]" />
                  )}
                  <span className="text-sm font-medium text-[#212121]">{tx}</span>
                  <ChevronRight className="ml-auto h-4 w-4 text-[#bdbdbd]" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 3 && (
          <>
            <SelectField
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
            />
            <SelectField
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
            />
            {microdistricts.length > 0 && (
              <SelectField
                label="Mikrorajonas"
                value={attr(attrs, "microdistrict")}
                onChange={(v) => onAttributeChange("microdistrict", v)}
                options={microdistricts}
              />
            )}
            {streets.length > 0 && (
              <SelectField
                label="Gatvė"
                value={attr(attrs, "street")}
                onChange={(v) => onAttributeChange("street", v)}
                options={streets}
              />
            )}
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
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-[#424242]">
                Plotas <span className="text-red-600">*</span>
              </label>
              <div className="flex">
                <input
                  type="text"
                  inputMode="decimal"
                  value={attr(attrs, "area")}
                  onChange={(e) => onAttributeChange("area", e.target.value)}
                  className="min-w-0 flex-1 rounded-l-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
                />
                <span className="flex items-center rounded-r-md border border-l-0 border-[#e0e0e0] bg-[#fafafa] px-3 text-sm text-[#757575]">
                  m²
                </span>
              </div>
            </div>

            {(propertyType === "namas" || propertyType === "sklypas") && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-[#424242]">Sklypo plotas</label>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1">
                    <input
                      type="text"
                      value={attr(attrs, "plotArea")}
                      onChange={(e) => onAttributeChange("plotArea", e.target.value)}
                      disabled={attr(attrs, "noPlot") === "true"}
                      className="min-w-0 flex-1 rounded-l-md border border-[#e0e0e0] px-3 py-2.5 text-sm disabled:bg-[#f5f5f5]"
                    />
                    <span className="flex items-center rounded-r-md border border-l-0 border-[#e0e0e0] bg-[#fafafa] px-3 text-sm text-[#757575]">
                      a
                    </span>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-[#424242]">
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

            {propertyType === "butas" && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-[#424242]">Aukštas</label>
                <input
                  type="text"
                  value={attr(attrs, "floor")}
                  onChange={(e) => onAttributeChange("floor", e.target.value)}
                  placeholder="2 / 5"
                  className="w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
                />
                <label className="mt-2 flex items-center gap-2 text-sm text-[#424242]">
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

            {(propertyType === "namas" || propertyType === "sklypas") && (
              <ChipRow
                label="Aukštų sk."
                options={["1", "2", "Įveskite"]}
                value={attr(attrs, "floors") || ""}
                onChange={(v) => onAttributeChange("floors", v === "Įveskite" ? "" : v)}
              />
            )}

            <div className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-[#424242]">Statybos metai</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={attr(attrs, "buildYear")}
                  onChange={(e) => onAttributeChange("buildYear", e.target.value)}
                  className="w-full rounded-md border border-[#e0e0e0] px-3 py-2.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-sm text-[#424242]">
                <input
                  type="checkbox"
                  checked={attr(attrs, "renovated") === "true"}
                  onChange={(e) =>
                    onAttributeChange("renovated", e.target.checked ? "true" : "false")
                  }
                  className="h-4 w-4 accent-[#4caf50]"
                />
                Namas renovuotas
              </label>
            </div>

            {(propertyType === "namas" || propertyType === "sklypas") && (
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

            <ChipRow
              label="Įrengimas"
              options={CONDITION_TYPES}
              value={attr(attrs, "condition")}
              onChange={(v) => onAttributeChange("condition", v)}
            />
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
            <button
              type="button"
              onClick={() =>
                requestMediaConsent(async () => {
                  const photo = await capturePhoto();
                  if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                })
              }
              className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#4caf50] bg-[#f1f8e9] px-4 py-8 text-[#2e7d32] hover:bg-[#e8f5e9]"
            >
              <Camera className="h-8 w-8" />
              <span className="text-sm font-semibold">Įkelkite nuotraukų (iki 50)</span>
            </button>
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
          </>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#e0e0e0] pt-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 text-sm font-medium text-[#757575] hover:text-[#212121]"
            >
              <ChevronLeft className="h-4 w-4" />
              Grįžti
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={!canNext && step < TOTAL_STEPS}
            onClick={goNext}
            className="rounded-md bg-[#ffc107] px-8 py-3 text-sm font-bold text-[#212121] hover:bg-[#ffb300] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step >= TOTAL_STEPS ? "Įvesti" : "Toliau"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

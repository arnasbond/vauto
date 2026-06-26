"use client";

import { Camera, CheckCircle2, ChevronRight, Circle, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { AiExtractedListing } from "@/lib/types";
import {
  formatSkelbiuCategory,
  ITEM_CONDITIONS,
  LISTING_ACTIONS,
  LT_CITIES,
  nodesAtPath,
  parseSkelbiuCategory,
  SELLER_TYPES,
} from "@/lib/general-catalog";
import {
  CONSTRUCTION_TOOL_TYPES,
  DEVICE_OS,
  ELECTRONICS_MANUFACTURERS,
  FURNITURE_MATERIALS,
  FURNITURE_TYPES,
  getSkelbiuFieldProfile,
  POWER_SOURCE_TYPES,
  STORAGE_CAPACITIES,
  WARRANTY_OPTIONS,
} from "@/lib/skelbiu-catalog";
import {
  clearGeneralListingDraft,
  saveGeneralListingDraft,
} from "@/lib/listing-draft-storage";
import { capturePhoto } from "@/lib/native-media";
import { LithuanianCityField } from "@/components/listing/LithuanianCityField";
import { ListingPhotoRequiredBanner } from "@/components/listing/ListingPhotoRequiredBanner";
import {
  firstValidationMessage,
  hasListingPhoto,
  isValidListingPhone,
  sanitizeListingPhoneInput,
  validateGeneralListingDraft,
} from "@/lib/listing-form-validation";
import { isPlaceholderCity } from "@/lib/city-resolve";

const inputCls =
  "listing-form-input w-full border-0 border-b py-2 text-sm outline-none";
const deepSelectCls =
  "listing-form-input mb-3 w-full border-0 border-b py-2 text-sm outline-none";

interface GeneralListingWizardProps {
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

function SkelbiuDeepFields({
  categoryPath,
  attrs,
  onAttributeChange,
}: {
  categoryPath: string;
  attrs: Record<string, string | string[] | undefined>;
  onAttributeChange: (key: string, value: string | string[]) => void;
}) {
  const profile = getSkelbiuFieldProfile(categoryPath);
  if (profile === "generic") return null;

  const selectCls = deepSelectCls;

  if (profile === "electronics") {
    return (
      <div className="mb-5 rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#1167b1]">
          Elektronika (Skelbiu.lt)
        </p>
        <label className="mb-2 block text-sm text-[#78909c]">Gamintojas</label>
        <select
          value={attr(attrs, "manufacturer")}
          onChange={(e) => onAttributeChange("manufacturer", e.target.value)}
          className={`mb-3 ${selectCls}`}
        >
          <option value="">Pasirinkite</option>
          {ELECTRONICS_MANUFACTURERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="mb-2 block text-sm text-[#78909c]">Modelis</label>
        <input
          type="text"
          value={attr(attrs, "deviceModel")}
          onChange={(e) => onAttributeChange("deviceModel", e.target.value)}
          placeholder="iPhone 15 Pro"
          className={`mb-3 ${selectCls}`}
        />
        <label className="mb-2 block text-sm text-[#78909c]">Atmintis</label>
        <select
          value={attr(attrs, "storageCapacity")}
          onChange={(e) => onAttributeChange("storageCapacity", e.target.value)}
          className={`mb-3 ${selectCls}`}
        >
          <option value="">—</option>
          {STORAGE_CAPACITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="mb-2 block text-sm text-[#78909c]">OS</label>
        <select
          value={attr(attrs, "deviceOs")}
          onChange={(e) => onAttributeChange("deviceOs", e.target.value)}
          className={`mb-3 ${selectCls}`}
        >
          <option value="">—</option>
          {DEVICE_OS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <label className="mb-2 block text-sm text-[#78909c]">Garantija</label>
        <select
          value={attr(attrs, "warranty")}
          onChange={(e) => onAttributeChange("warranty", e.target.value)}
          className={selectCls}
        >
          <option value="">—</option>
          {WARRANTY_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (profile === "furniture") {
    return (
      <div className="mb-5 rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#1167b1]">
          Baldai (Skelbiu.lt)
        </p>
        <label className="mb-2 block text-sm text-[#78909c]">Baldų tipas</label>
        <select
          value={attr(attrs, "furnitureType")}
          onChange={(e) => onAttributeChange("furnitureType", e.target.value)}
          className={`mb-3 ${selectCls}`}
        >
          <option value="">—</option>
          {FURNITURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="mb-2 block text-sm text-[#78909c]">Medžiaga</label>
        <select
          value={attr(attrs, "material")}
          onChange={(e) => onAttributeChange("material", e.target.value)}
          className={selectCls}
        >
          <option value="">—</option>
          {FURNITURE_MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-lg border border-[#e0e0e0] bg-[#fafafa] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#1167b1]">
        Statyba / įrankiai (Skelbiu.lt)
      </p>
      <label className="mb-2 block text-sm text-[#78909c]">Tipas</label>
      <select
        value={attr(attrs, "toolType")}
        onChange={(e) => onAttributeChange("toolType", e.target.value)}
        className={`mb-3 ${selectCls}`}
      >
        <option value="">—</option>
        {CONSTRUCTION_TOOL_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <label className="mb-2 block text-sm text-[#78909c]">Maitinimas</label>
      <select
        value={attr(attrs, "powerSource")}
        onChange={(e) => onAttributeChange("powerSource", e.target.value)}
        className={selectCls}
      >
        <option value="">—</option>
        {POWER_SOURCE_TYPES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldStatus({ valid }: { valid: boolean }) {
  return valid ? (
    <CheckCircle2 className="listing-form-accent h-4 w-4 shrink-0" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 shrink-0 text-[var(--vauto-border)]" aria-hidden />
  );
}

function TogglePair({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-5">
      <p className="listing-form-label mb-2 text-sm">{label}</p>
      <div className="flex flex-wrap gap-0 overflow-hidden rounded-md border border-[var(--vauto-border)]">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-2 text-sm transition ${
              value === opt ? "listing-form-toggle-active" : "listing-form-toggle-idle hover:opacity-90"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkelbiuField({
  label,
  valid,
  children,
}: {
  label: string;
  valid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-5 flex gap-3">
      <div className="pt-2">
        <FieldStatus valid={Boolean(valid)} />
      </div>
      <div className="min-w-0 flex-1">
        <label className="listing-form-label mb-1 block text-sm">{label}</label>
        {children}
      </div>
    </div>
  );
}

export function GeneralListingWizard({
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
}: GeneralListingWizardProps) {
  const { user } = useAuth();
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categoryPath, setCategoryPath] = useState<string[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);

  const categoryValue = attr(attrs, "skelbiuCategory");
  const phone = draft.contact?.trim() || user.phone || "+370 ";
  const email = user.email ?? "";

  const titleValid = draft.title.trim().length >= 3;
  const categoryValid = Boolean(categoryValue);
  const priceValid = draft.price > 0;
  const cityValid =
    !isPlaceholderCity(draft.location) && draft.location.trim().length >= 2;

  const canPublish =
    titleValid &&
    categoryValid &&
    Boolean(draft.description?.trim()) &&
    priceValid &&
    Boolean(attr(attrs, "condition")) &&
    cityValid &&
    isValidListingPhone(phone) &&
    termsAccepted &&
    hasListingPhoto(previewImage);

  const showPhotoError = !hasListingPhoto(previewImage);

  const pickerNodes = nodesAtPath(categoryPath);

  const selectCategoryNode = (label: string) => {
    const nextPath = [...categoryPath, label];
    const children = nodesAtPath(nextPath);
    if (children.length === 0) {
      onAttributeChange("skelbiuCategory", formatSkelbiuCategory(nextPath));
      setShowCategoryPicker(false);
      setCategoryPath([]);
    } else {
      setCategoryPath(nextPath);
    }
  };

  const handleSaveDraft = () => {
    saveGeneralListingDraft({ ...draft, attributes: attrs }, previewImage);
    onToast?.("Ruošinys išsaugotas.", "success");
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handlePublish = () => {
    const phoneValue = draft.contact?.trim() || phone;
    const issues = validateGeneralListingDraft(draft, attrs, {
      phone: phoneValue,
      termsAccepted,
      previewImage,
    });
    const errorMsg = firstValidationMessage(issues);
    if (errorMsg) {
      onToast?.(errorMsg, "error");
      return;
    }
    if (!draft.contact?.trim()) onUpdate({ contact: phoneValue });
    clearGeneralListingDraft();
    onPublish();
  };

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell">
        <div className="listing-form-shell mx-auto min-h-full w-full max-w-2xl pb-28 shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--vauto-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="listing-form-cta flex h-8 w-8 items-center justify-center rounded-full">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-bold">VAUTO</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[var(--vauto-text-muted)] hover:bg-[color-mix(in_srgb,var(--vauto-text)_6%,transparent)]"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-5">
          {manualFallback && (
            <p className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--portal-accent,var(--vauto-accent))_35%,transparent)] bg-[color-mix(in_srgb,var(--portal-accent,var(--vauto-accent))_8%,transparent)] px-3 py-2 text-xs listing-form-accent">
              AI nepavyko pilnai atpažinti — užpildykite skelbimą ranka.
            </p>
          )}

          <ListingPhotoRequiredBanner visible={showPhotoError} />

          <div className="mb-6 flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() =>
                requestMediaConsent(async () => {
                  const photo = await capturePhoto();
                  if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                })
              }
              className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-text)_4%,transparent)] text-xs text-[var(--vauto-text-muted)] transition hover:border-[var(--portal-accent,var(--vauto-accent))] hover:bg-[color-mix(in_srgb,var(--portal-accent,var(--vauto-accent))_8%,transparent)]"
            >
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="" className="h-full w-full rounded-lg object-cover" />
              ) : (
                <>
                  <Camera className="h-8 w-8 text-[var(--vauto-text-muted)]" />
                  Pridėti nuotrauką
                </>
              )}
            </button>
            {previewImage && (
              <button
                type="button"
                onClick={() =>
                  requestMediaConsent(async () => {
                    const photo = await capturePhoto();
                    if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                  })
                }
                className="flex h-28 w-28 items-center justify-center rounded-xl border border-[var(--vauto-border)] bg-[color-mix(in_srgb,var(--vauto-text)_4%,transparent)] transition hover:border-[var(--portal-accent,var(--vauto-accent))]"
                aria-label="Pridėti dar vieną nuotrauką"
              >
                <Plus className="h-10 w-10 text-[var(--vauto-text-muted)]" />
              </button>
            )}
          </div>

          <SkelbiuField label="Skelbimo antraštė" valid={titleValid}>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Parduodu…"
              className={inputCls}
            />
          </SkelbiuField>

          <SkelbiuField label="Kategorija" valid={categoryValid}>
            <button
              type="button"
              onClick={() => {
                setShowCategoryPicker((s) => !s);
                setCategoryPath(parseSkelbiuCategory(categoryValue).slice(0, -1));
              }}
              className="flex w-full items-center justify-between border-0 border-b border-[var(--vauto-border)] py-2 text-left text-sm"
            >
              <span className={categoryValue ? "" : "text-[var(--vauto-text-muted)]"}>
                {categoryValue || "Pasirinkite kategoriją"}
              </span>
              <ChevronRight className="h-4 w-4 text-[#bdbdbd]" />
            </button>
            {categoryValue && (
              <p className="listing-form-label mt-1 text-xs">{categoryValue}</p>
            )}
          </SkelbiuField>

          {showCategoryPicker && (
            <div className="mb-5 rounded border border-[#e0e0e0] bg-[#fafafa]">
              {categoryPath.length > 0 && (
                <div className="flex items-center gap-2 border-b border-[#e0e0e0] px-3 py-2 text-xs text-[#78909c]">
                  <button
                    type="button"
                    onClick={() => setCategoryPath((p) => p.slice(0, -1))}
                    className="text-[#1167b1] hover:underline"
                  >
                    ← Atgal
                  </button>
                  <span>{formatSkelbiuCategory(categoryPath)}</span>
                </div>
              )}
              {pickerNodes.map((node) => (
                <button
                  key={node.label}
                  type="button"
                  onClick={() => selectCategoryNode(node.label)}
                  className="flex w-full items-center justify-between border-b border-[#eeeeee] px-4 py-3 text-left text-sm hover:bg-white"
                >
                  {node.label}
                  {node.children?.length ? (
                    <ChevronRight className="h-4 w-4 text-[#bdbdbd]" />
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {categoryValue && (
            <SkelbiuDeepFields
              categoryPath={categoryValue}
              attrs={attrs}
              onAttributeChange={onAttributeChange}
            />
          )}

          <SkelbiuField label="Aprašymas" valid={Boolean(draft.description?.trim())}>
            <textarea
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Viskas komplekte"
              className="w-full resize-none border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#1167b1]"
            />
          </SkelbiuField>

          <TogglePair
            label="Veiksmas:"
            options={LISTING_ACTIONS}
            value={attr(attrs, "listingAction") || "Siūlau"}
            onChange={(v) => onAttributeChange("listingAction", v)}
          />

          <SkelbiuField label="Kaina, €" valid={priceValid}>
            <input
              type="number"
              min={0}
              value={draft.price > 0 ? draft.price : ""}
              onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
              className="w-full max-w-xs border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#1167b1]"
            />
          </SkelbiuField>

          <TogglePair
            label="Būklė:"
            options={ITEM_CONDITIONS}
            value={attr(attrs, "condition")}
            onChange={(v) => onAttributeChange("condition", v)}
          />

          <TogglePair
            label="Jūs esate:"
            options={SELLER_TYPES}
            value={attr(attrs, "sellerType") || "Privatus asmuo"}
            onChange={(v) => onAttributeChange("sellerType", v)}
          />

          {(attr(attrs, "sellerType") || "").includes("Įmonė") && (
            <SkelbiuField
              label="Įmonės pavadinimas"
              valid={Boolean(attr(attrs, "companyName")?.trim())}
            >
              <input
                type="text"
                name="organization"
                autoComplete="organization"
                value={attr(attrs, "companyName")}
                onChange={(e) => onAttributeChange("companyName", e.target.value)}
                placeholder="UAB Pavadinimas"
                className={inputCls}
              />
            </SkelbiuField>
          )}

          <SkelbiuField label="Miestas" valid={cityValid}>
            <LithuanianCityField
              location={draft.location}
              cityOptions={LT_CITIES}
              onLocationChange={(city) => onUpdate({ location: city })}
            />
          </SkelbiuField>

          <div className="mb-4 flex gap-3">
            <FieldStatus valid={isValidListingPhone(phone)} />
            <div className="flex-1">
              <label className="mb-1 block text-sm text-[#78909c]" htmlFor="listing-phone">
                Telefonas
              </label>
              <input
                id="listing-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={draft.contact?.trim() ? draft.contact : phone}
                onChange={(e) =>
                  onUpdate({ contact: sanitizeListingPhoneInput(e.target.value) })
                }
                placeholder="+370 600 00000"
                className={inputCls}
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-[#546e7a]">
                <input
                  type="checkbox"
                  checked={attr(attrs, "hidePhone") === "true"}
                  onChange={(e) =>
                    onAttributeChange("hidePhone", e.target.checked ? "true" : "false")
                  }
                  className="accent-[#1167b1]"
                />
                Nerodyti telefono numerio skelbime
              </label>
            </div>
          </div>

          {email && (
            <div className="mb-5 flex gap-3">
              <FieldStatus valid />
              <div className="flex-1">
                <p className="text-sm text-[#78909c]">El. paštas</p>
                <p className="text-sm font-medium text-[#263238]">{email}</p>
              </div>
            </div>
          )}

          <label className="mb-6 flex items-start gap-2 text-sm text-[var(--vauto-text-muted)]">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Sutinku su{" "}
              <span className="listing-form-accent">VAUTO taisyklėmis</span> ir{" "}
              <span className="listing-form-accent">privatumo politika</span>.
            </span>
          </label>

          <button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish}
            className={`listing-form-cta mb-3 w-full rounded-full py-3.5 text-lg font-bold ${
              canPublish ? "" : "cursor-not-allowed opacity-60"
            }`}
          >
            Įdėti skelbimą
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="listing-form-accent w-full rounded-full border-2 border-[var(--portal-accent,var(--vauto-accent))] py-3 text-base font-semibold"
          >
            Išsaugoti ruošinį
          </button>
        </div>
      </div>
    </div>
  );
}

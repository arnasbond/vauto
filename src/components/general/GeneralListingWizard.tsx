"use client";

import { Camera, CheckCircle2, ChevronRight, Circle, Plus, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
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
  clearGeneralListingDraft,
  saveGeneralListingDraft,
} from "@/lib/listing-draft-storage";
import { capturePhoto } from "@/lib/native-media";

const ACCENT = "#43a047";

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

function FieldStatus({ valid }: { valid: boolean }) {
  return valid ? (
    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#43a047]" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 shrink-0 text-[#bdbdbd]" aria-hidden />
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
      <p className="mb-2 text-sm text-[#455a64]">{label}</p>
      <div className="flex flex-wrap gap-0 overflow-hidden rounded-md border border-[#cfd8dc]">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-2 text-sm transition ${
              value === opt
                ? "bg-[#e8f5e9] font-medium text-[#2e7d32]"
                : "bg-white text-[#546e7a] hover:bg-[#f5f5f5]"
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
        <label className="mb-1 block text-sm text-[#78909c]">{label}</label>
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
  const phone = draft.contact?.trim() || user.phone || "+370";
  const email = user.email ?? "";

  const titleValid = draft.title.trim().length >= 3;
  const categoryValid = Boolean(categoryValue);
  const priceValid = draft.price > 0;
  const cityValid = draft.location.trim().length >= 2;

  const canPublish =
    titleValid &&
    categoryValid &&
    draft.description?.trim() &&
    priceValid &&
    attr(attrs, "condition") &&
    cityValid &&
    phone &&
    termsAccepted;

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

  const handlePublish = () => {
    if (!draft.contact) onUpdate({ contact: phone });
    clearGeneralListingDraft();
    onPublish();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto chameleon-wizard-shell bg-[var(--portal-wizard-bg,#eceff1)]">
      <div className="mx-auto min-h-full max-w-2xl pb-10">
        <div className="flex items-center justify-between border-b border-[#e0e0e0] px-4 py-3">
          <span className="text-lg font-bold text-[#43a047]">skelbiu.lt</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 text-[#757575] hover:bg-[#f5f5f5]"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-5">
          {manualFallback && (
            <p className="mb-4 rounded border border-[#c8e6c9] bg-[#e8f5e9] px-3 py-2 text-xs text-[#2e7d32]">
              AI nepavyko pilnai atpažinti — užpildykite skelbimą ranka.
            </p>
          )}

          <div className="mb-6 flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() =>
                requestMediaConsent(async () => {
                  const photo = await capturePhoto();
                  if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                })
              }
              className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded border border-[#e0e0e0] bg-[#fafafa] text-xs text-[#757575] hover:border-[#43a047]"
            >
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt="" className="h-full w-full rounded object-cover" />
              ) : (
                <>
                  <Camera className="h-8 w-8 text-[#9e9e9e]" />
                  ĮKELK NUOTRAUKŲ
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                requestMediaConsent(async () => {
                  const photo = await capturePhoto();
                  if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                })
              }
              className="flex h-28 w-28 items-center justify-center rounded border border-[#e0e0e0] bg-[#fafafa] hover:border-[#43a047]"
            >
              <Plus className="h-10 w-10 text-[#bdbdbd]" />
            </button>
            <div className="min-w-[140px] flex-1 text-sm">
              <button type="button" className="font-medium text-[#43a047] hover:underline">
                Tvarkyti nuotraukas »
              </button>
              <p className="mt-1 text-xs text-[#9e9e9e]">Trinti | Keisti vietą | Pasukti</p>
            </div>
          </div>

          <SkelbiuField label="Skelbimo antraštė" valid={titleValid}>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
              placeholder="Parduodu…"
              className="w-full border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]"
            />
          </SkelbiuField>

          <SkelbiuField label="Kategorija" valid={categoryValid}>
            <button
              type="button"
              onClick={() => {
                setShowCategoryPicker((s) => !s);
                setCategoryPath(parseSkelbiuCategory(categoryValue).slice(0, -1));
              }}
              className="flex w-full items-center justify-between border-0 border-b border-[#cfd8dc] py-2 text-left text-sm"
            >
              <span className={categoryValue ? "text-[#263238]" : "text-[#9e9e9e]"}>
                {categoryValue || "Pasirinkite kategoriją"}
              </span>
              <ChevronRight className="h-4 w-4 text-[#bdbdbd]" />
            </button>
            {categoryValue && (
              <p className="mt-1 text-xs text-[#78909c]">{categoryValue}</p>
            )}
          </SkelbiuField>

          {showCategoryPicker && (
            <div className="mb-5 rounded border border-[#e0e0e0] bg-[#fafafa]">
              {categoryPath.length > 0 && (
                <div className="flex items-center gap-2 border-b border-[#e0e0e0] px-3 py-2 text-xs text-[#78909c]">
                  <button
                    type="button"
                    onClick={() => setCategoryPath((p) => p.slice(0, -1))}
                    className="text-[#43a047] hover:underline"
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

          <SkelbiuField label="Aprašymas" valid={Boolean(draft.description?.trim())}>
            <textarea
              rows={3}
              value={draft.description ?? ""}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Viskas komplekte"
              className="w-full resize-none border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]"
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
              className="w-full max-w-xs border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]"
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

          <SkelbiuField label="Miestas" valid={cityValid}>
            <select
              value={draft.location.split(",")[0]?.trim() || ""}
              onChange={(e) => onUpdate({ location: e.target.value })}
              className="w-full max-w-xs border-0 border-b border-[#cfd8dc] bg-transparent py-2 text-sm outline-none focus:border-[#43a047]"
            >
              <option value="">Pasirinkite</option>
              {LT_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </SkelbiuField>

          <div className="mb-4 flex gap-3">
            <FieldStatus valid={Boolean(phone)} />
            <div className="flex-1">
              <p className="text-sm text-[#78909c]">Telefonas</p>
              <p className="text-sm font-medium text-[#263238]">{phone}</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-[#546e7a]">
                <input
                  type="checkbox"
                  checked={attr(attrs, "hidePhone") === "true"}
                  onChange={(e) =>
                    onAttributeChange("hidePhone", e.target.checked ? "true" : "false")
                  }
                  className="accent-[#43a047]"
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

          <label className="mb-6 flex items-start gap-2 text-sm text-[#546e7a]">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 accent-[#43a047]"
            />
            <span>
              Sutinku su{" "}
              <span className="text-[#43a047]">Skelbiu.lt taisyklėmis</span> ir{" "}
              <span className="text-[#43a047]">privatumo politika</span>.
            </span>
          </label>

          <button
            type="button"
            disabled={!canPublish}
            onClick={handlePublish}
            className="mb-3 w-full rounded-full py-3.5 text-lg font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            Įdėti skelbimą
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="w-full rounded-full border-2 border-[#43a047] py-3 text-base font-semibold text-[#43a047]"
          >
            Išsaugoti ruošinį
          </button>
        </div>
      </div>
    </div>
  );
}

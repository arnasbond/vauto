"use client";

import { ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiExtractedListing } from "@/lib/types";
import {
  CLOTHING_COLORS,
  CLOTHING_SIZES,
  formatVintedCategory,
  parseVintedCategory,
  POPULAR_BRANDS,
  subcategoriesFor,
  VINTED_CATEGORIES,
  VINTED_CONDITIONS,
} from "@/lib/clothing-catalog";
import {
  clearClothingListingDraft,
  saveClothingListingDraft,
} from "@/lib/listing-draft-storage";
import { capturePhoto } from "@/lib/native-media";

const ACCENT = "#09b1a8";

interface ClothingListingWizardProps {
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

function VintedField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  const shared =
    "w-full border-0 border-b border-[#e8e4df] bg-transparent px-0 py-2 text-sm text-[#374151] outline-none placeholder:text-[#9ca3af] focus:border-[#09b1a8]";
  return (
    <div className="px-4 py-3">
      <label className="mb-0.5 block text-xs text-[#9ca3af]">{label}</label>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${shared} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={shared}
        />
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-base font-semibold text-[#1f2937]">{children}</h2>;
}

export function ClothingListingWizard({
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
}: ClothingListingWizardProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);

  const categoryValue = attr(attrs, "vintedCategory");
  const { group: categoryGroup, sub: categorySub } = parseVintedCategory(categoryValue);

  const canPublish =
    Boolean(previewImage) &&
    draft.title.trim().length >= 2 &&
    Boolean(categoryValue) &&
    Boolean(attr(attrs, "size")) &&
    Boolean(attr(attrs, "brand")) &&
    Boolean(attr(attrs, "condition")) &&
    Boolean(attr(attrs, "color")) &&
    draft.price > 0;

  const handleSaveDraft = () => {
    saveClothingListingDraft(
      { ...draft, category: "clothing", attributes: attrs },
      previewImage
    );
    onToast?.("Ruošinys išsaugotas. Galite tęsti vėliau.", "success");
  };

  const handlePublish = () => {
    onUpdate({ category: "clothing" });
    clearClothingListingDraft();
    onPublish();
  };

  const selectCategory = (group: string, sub: string) => {
    onAttributeChange("vintedCategory", formatVintedCategory(group, sub));
    if (group === "Moterims" || group === "Vyrams" || group === "Vaikams") {
      onAttributeChange("clothingType", group);
    }
    setShowCategoryPicker(false);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell bg-[var(--portal-wizard-bg,#faf8f5)]">
        <div className="mx-auto w-full max-w-lg bg-[#faf8f5] pb-8">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e8e4df] bg-[#fffdf9] px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              V
            </span>
            <span className="text-sm font-light text-[#6b7280]">Įkelti prekę</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1.5 text-[#9ca3af] hover:bg-[#f3f4f6]"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pt-5">
          {manualFallback && (
            <p className="mb-4 rounded-2xl border border-[#b8ebe8] bg-[#e6f7f6] px-3 py-2 text-xs text-[#374151]">
              AI nepavyko pilnai atpažinti — užpildykite prekės informaciją ranka.
            </p>
          )}

          <SectionTitle>Nuotraukos</SectionTitle>
          <div className="mb-6 rounded-2xl border border-dashed border-[#d1d5db] bg-white p-4">
            {previewImage ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImage}
                  alt=""
                  className="max-h-56 w-full rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    requestMediaConsent(async () => {
                      const photo = await capturePhoto();
                      if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                    })
                  }
                  className="mt-3 w-full rounded-full border border-[#09b1a8] py-2 text-sm font-medium text-[#09b1a8]"
                >
                  + Pridėti nuotraukų
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  requestMediaConsent(async () => {
                    const photo = await capturePhoto();
                    if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
                  })
                }
                className="flex w-full flex-col items-center justify-center gap-3 py-10"
              >
                <span className="rounded-full border-2 border-[#09b1a8] px-5 py-2 text-sm font-medium text-[#09b1a8]">
                  + Įkelti nuotraukų
                </span>
              </button>
            )}
          </div>

          <SectionTitle>Apie prekę</SectionTitle>
          <div className="mb-6 overflow-hidden rounded-2xl border border-[#e8e4df] bg-white">
            <VintedField
              label="Pavadinimas"
              value={draft.title}
              onChange={(v) => onUpdate({ title: v })}
              placeholder="Papasakok pirkėjams, ką parduodi"
            />
            <div className="border-t border-[#f3f4f6]" />
            <VintedField
              label="Aprašymas"
              value={draft.description ?? ""}
              onChange={(v) => onUpdate({ description: v })}
              placeholder="Papasakok daugiau apie prekę"
              multiline
            />
          </div>

          <SectionTitle>Prekės informacija</SectionTitle>
          <div className="mb-3 overflow-hidden rounded-2xl border border-[#e8e4df] bg-white">
            <button
              type="button"
              onClick={() => setShowCategoryPicker((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-4 text-left"
            >
              <div>
                <p className="text-xs text-[#9ca3af]">Kategorija</p>
                <p className={`text-sm ${categoryValue ? "text-[#374151]" : "text-[#9ca3af]"}`}>
                  {categoryValue || "Pasirink kategoriją"}
                </p>
              </div>
              <ChevronRight
                className={`h-5 w-5 text-[#9ca3af] transition ${showCategoryPicker ? "rotate-90" : ""}`}
              />
            </button>
          </div>

          {showCategoryPicker && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-[#e8e4df] bg-white">
              {Object.keys(VINTED_CATEGORIES).map((group) => (
                <div key={group} className="border-b border-[#f3f4f6] last:border-0">
                  <p className="bg-[#faf8f5] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                    {group}
                  </p>
                  {subcategoriesFor(group).map((sub) => (
                    <button
                      key={`${group}-${sub}`}
                      type="button"
                      onClick={() => selectCategory(group, sub)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[#faf8f5] ${
                        categoryGroup === group && categorySub === sub
                          ? "bg-[#e6f7f6] font-medium text-[#09b1a8]"
                          : "text-[#374151]"
                      }`}
                    >
                      {sub}
                      <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {categoryValue && (
            <div className="mb-6 space-y-3 rounded-2xl border border-[#e8e4df] bg-white p-4">
              <div>
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Dydis *</label>
                <div className="flex flex-wrap gap-2">
                  {CLOTHING_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onAttributeChange("size", size)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        attr(attrs, "size") === size
                          ? "border-[#09b1a8] bg-[#09b1a8] text-white"
                          : "border-[#e8e4df] bg-white text-[#374151]"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Prekės ženklas *</label>
                <input
                  type="text"
                  list="vinted-brands"
                  value={attr(attrs, "brand")}
                  onChange={(e) => onAttributeChange("brand", e.target.value)}
                  placeholder="Zara, Nike…"
                  className="w-full border-0 border-b border-[#e8e4df] bg-transparent py-2 text-sm outline-none focus:border-[#09b1a8]"
                />
                <datalist id="vinted-brands">
                  {POPULAR_BRANDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Būklė *</label>
                <select
                  value={attr(attrs, "condition")}
                  onChange={(e) => onAttributeChange("condition", e.target.value)}
                  className="w-full rounded-xl border border-[#e8e4df] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#09b1a8]"
                >
                  <option value="">Pasirinkite būklę</option>
                  {VINTED_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Spalva *</label>
                <div className="flex flex-wrap gap-2">
                  {CLOTHING_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onAttributeChange("color", color)}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        attr(attrs, "color") === color
                          ? "border-[#09b1a8] bg-[#09b1a8] text-white"
                          : "border-[#e8e4df] text-[#374151]"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <SectionTitle>Kaina</SectionTitle>
          <div className="mb-6 overflow-hidden rounded-2xl border border-[#e8e4df] bg-white px-4 py-3">
            <label className="mb-0.5 block text-xs text-[#9ca3af]">Kaina</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.price > 0 ? draft.price : ""}
                onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
                placeholder="0,00"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-lg text-[#374151] outline-none"
              />
              <span className="text-lg text-[#9ca3af]">€</span>
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#e8e4df] bg-white px-4 py-3 text-sm text-[#6b7280]">
            <span>Ką manai apie įkėlimo procesą?</span>
            <button
              type="button"
              onClick={() => onToast?.("Ačiū už atsiliepimą!", "info")}
              className="shrink-0 rounded-full border border-[#09b1a8] px-3 py-1 text-xs font-medium text-[#09b1a8]"
            >
              Palikti atsiliepimą
            </button>
          </div>

          <button
            type="button"
            disabled={!canPublish}
            onClick={handlePublish}
            className="mb-3 w-full rounded-full py-3.5 text-base font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: ACCENT }}
          >
            Įkelti
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="w-full rounded-full border border-[#09b1a8] py-3.5 text-base font-medium text-[#09b1a8]"
          >
            Išsaugoti ruošinį
          </button>
        </div>
      </div>
    </div>
  );
}

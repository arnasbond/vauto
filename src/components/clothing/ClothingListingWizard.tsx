"use client";

import { ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiExtractedListing } from "@/lib/types";
import { ListingPublishSocialOptions } from "@/components/seller/ListingPublishSocialOptions";
import {
  CLOTHING_COLORS,
  formatVintedCategory,
  parseVintedCategory,
  POPULAR_BRANDS,
  sizesForVintedListing,
  subcategoriesFor,
  VINTED_CATEGORY_TREE,
  VINTED_CONDITIONS,
  VINTED_SHIPPING_OPTIONS,
} from "@/lib/clothing-catalog";
import {
  clearClothingListingDraft,
  saveClothingListingDraft,
} from "@/lib/listing-draft-storage";
import {
  applyFirstGalleryFile,
  ListingGalleryFileInput,
} from "@/components/listing/ListingGalleryFileInput";
import {
  analyzeWardrobePhoto,
  wardrobeItemToDraft,
  type WardrobeDraftItem,
} from "@/lib/wardrobe-vision";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { WardrobeProfileImporter } from "@/components/clothing/WardrobeProfileImporter";
import { MagicMirrorPanel } from "@/components/clothing/MagicMirrorPanel";

const ACCENT = "#09b1a8";

interface ClothingListingWizardProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  manualFallback?: boolean;
  userName?: string;
  defaultLocation?: string;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null }) => void;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
  onPublishBulk?: (drafts: AiExtractedListing[]) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
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
  userName,
  defaultLocation = "",
  onUpdate,
  onAttributeChange,
  onMediaChange,
  requestMediaConsent,
  onCancel,
  onPublish,
  onPublishBulk,
  onToast,
}: ClothingListingWizardProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeDraftItem[]>([]);
  const [wardrobeAnalyzing, setWardrobeAnalyzing] = useState(false);
  const [wardrobeVoice, setWardrobeVoice] = useState<string | null>(null);
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);

  const categoryValue = attr(attrs, "vintedCategory");
  const { group: categoryGroup, sub: categorySub } = parseVintedCategory(categoryValue);
  const sizeOptions = useMemo(
    () => (categoryGroup && categorySub ? sizesForVintedListing(categoryGroup, categorySub) : []),
    [categoryGroup, categorySub]
  );
  const selectedColors = attrArray(attrs, "colors").length
    ? attrArray(attrs, "colors")
    : attr(attrs, "color")
      ? [attr(attrs, "color")]
      : [];
  const shippingOptions = attrArray(attrs, "shipping");

  const toggleColor = (color: string) => {
    const next = selectedColors.includes(color)
      ? selectedColors.filter((c) => c !== color)
      : [...selectedColors, color];
    onAttributeChange("colors", next);
    onAttributeChange("color", next[0] ?? "");
  };

  const toggleShipping = (opt: string) => {
    const next = shippingOptions.includes(opt)
      ? shippingOptions.filter((s) => s !== opt)
      : [...shippingOptions, opt];
    onAttributeChange("shipping", next);
  };

  const canPublish =
    Boolean(previewImage) &&
    draft.title.trim().length >= 2 &&
    Boolean(categoryValue) &&
    Boolean(attr(attrs, "size")) &&
    Boolean(attr(attrs, "brand")) &&
    Boolean(attr(attrs, "condition")) &&
    selectedColors.length > 0 &&
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

  const runWardrobeVision = async (imageDataUrl: string) => {
    setWardrobeAnalyzing(true);
    setWardrobeItems([]);
    try {
      const result = await analyzeWardrobePhoto({
        imageDataUrl,
        userName,
      });
      if (!result?.items.length) return;

      setWardrobeItems(result.items);
      setWardrobeVoice(result.voiceAnnouncement);
      speakBuddyMessage(result.voiceAnnouncement, { enabled: true });
      onToast?.(result.voiceAnnouncement, "info");

      if (result.items.length === 1) {
        const single = wardrobeItemToDraft(
          result.items[0],
          draft.contact,
          draft.location
        );
        onUpdate(single);
        for (const [key, val] of Object.entries(single.attributes ?? {})) {
          onAttributeChange(key, val as string | string[]);
        }
      }
    } finally {
      setWardrobeAnalyzing(false);
    }
  };

  const applyWardrobeItem = (item: WardrobeDraftItem) => {
    const next = wardrobeItemToDraft(item, draft.contact, draft.location);
    onUpdate(next);
    for (const [key, val] of Object.entries(next.attributes ?? {})) {
      onAttributeChange(key, val as string | string[]);
    }
    onToast?.(`Redaguojate: ${item.title}`, "info");
  };

  const handlePublishAllWardrobe = () => {
    if (!onPublishBulk || !wardrobeItems.length) return;
    const drafts = wardrobeItems.map((item) =>
      wardrobeItemToDraft(item, draft.contact, draft.location || defaultLocation)
    );
    clearClothingListingDraft();
    onPublishBulk(drafts);
  };

  const handleProfileImport = (drafts: AiExtractedListing[], voice: string) => {
    speakBuddyMessage(voice, { enabled: true });
    if (onPublishBulk && drafts.length > 1) {
      onPublishBulk(drafts);
      return;
    }
    if (drafts[0]) {
      onUpdate(drafts[0]);
      for (const [key, val] of Object.entries(drafts[0].attributes ?? {})) {
        onAttributeChange(key, val as string | string[]);
      }
    }
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

          <WardrobeProfileImporter
            userName={userName}
            defaultLocation={draft.location || defaultLocation}
            contact={draft.contact}
            onImportReady={handleProfileImport}
            onToast={onToast}
          />

          <SectionTitle>Nuotraukos</SectionTitle>
          <div className="mb-6 rounded-2xl border border-dashed border-[#d1d5db] bg-white p-4">
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewImage}
                alt=""
                className="mb-3 max-h-56 w-full rounded-xl object-cover"
              />
            )}
            <ListingGalleryFileInput
              requestConsent={requestMediaConsent}
              className="flex w-full flex-col items-center justify-center gap-3 py-6 text-[#09b1a8]"
              label={previewImage ? "+ Pridėti nuotraukų" : "+ Įkelti nuotraukų"}
              onFilesSelected={(files) => {
                applyFirstGalleryFile(files, (dataUrl) => {
                  onMediaChange({ imageDataUrl: dataUrl });
                  void runWardrobeVision(dataUrl);
                });
              }}
            />
            {wardrobeAnalyzing && (
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-[#6b7280]">
                <Loader2 className="h-4 w-4 animate-spin text-[#09b1a8]" />
                Smart Wardrobe Vision analizuoja drabužius…
              </p>
            )}
          </div>

          {wardrobeItems.length > 1 && (
            <div className="mb-6 rounded-2xl border border-[#b8ebe8] bg-[#e6f7f6] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#09b1a8]" />
                <p className="text-sm font-semibold text-[#1f2937]">
                  AI aptiko {wardrobeItems.length} drabužius
                </p>
              </div>
              {wardrobeVoice && (
                <p className="mb-3 text-xs italic text-[#374151]">{wardrobeVoice}</p>
              )}
              <div className="space-y-2">
                {wardrobeItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyWardrobeItem(item)}
                    className="flex w-full items-center justify-between rounded-xl border border-white bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-[#09b1a8]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#374151]">{item.title}</p>
                      <p className="text-[10px] text-[#9ca3af]">
                        {item.categorySub} · {item.size} · {item.color} · {item.suggestedPrice} €
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
                  </button>
                ))}
              </div>
              {onPublishBulk && (
                <button
                  type="button"
                  onClick={handlePublishAllWardrobe}
                  className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  Patvirtinti visus {wardrobeItems.length} skelbimus
                </button>
              )}
            </div>
          )}

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
          <MagicMirrorPanel
            chestCm={attr(attrs, "chestCm")}
            waistCm={attr(attrs, "waistCm")}
            hipsCm={attr(attrs, "hipsCm")}
            lengthCm={attr(attrs, "lengthCm")}
            onChange={onAttributeChange}
          />
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
              {Object.keys(VINTED_CATEGORY_TREE).map((group) => (
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
                  {(sizeOptions.length ? sizeOptions : ["XS", "S", "M", "L", "XL"]).map((size) => (
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
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Spalva * (galima kelios)</label>
                <div className="flex flex-wrap gap-2">
                  {CLOTHING_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        selectedColors.includes(color)
                          ? "border-[#09b1a8] bg-[#09b1a8] text-white"
                          : "border-[#e8e4df] text-[#374151]"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-[#9ca3af]">Siuntimo būdai</label>
                <div className="space-y-2">
                  {VINTED_SHIPPING_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-[#374151]">
                      <input
                        type="checkbox"
                        checked={shippingOptions.includes(opt)}
                        onChange={() => toggleShipping(opt)}
                        className="accent-[#09b1a8]"
                      />
                      {opt}
                    </label>
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

          <ListingPublishSocialOptions className="mb-4" />

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

"use client";

import { ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AiExtractedListing } from "@/lib/types";
import { ListingPublishSocialOptions } from "@/components/seller/ListingPublishSocialOptions";
import {
  CLOTHING_COLORS,
  FASHION_CATEGORY_ATTR,
  FASHION_CATEGORY_TREE,
  FASHION_CONDITIONS,
  FASHION_SHIPPING_OPTIONS,
  formatFashionCategory,
  parseFashionCategory,
  POPULAR_BRANDS,
  readFashionCategory,
  sizesForFashionListing,
  subcategoriesFor,
} from "@/lib/clothing-catalog";
import {
  clearClothingListingDraft,
  saveClothingListingDraft,
} from "@/lib/listing-draft-storage";
import {
  readGalleryFilesAsDataUrls,
  ListingGalleryFileInput,
} from "@/components/listing/ListingGalleryFileInput";
import { WardrobeFlowAgentStrip } from "@/components/clothing/WardrobeFlowAgentStrip";
import {
  analyzeWardrobePhoto,
  wardrobeItemToDraft,
  type WardrobeDraftItem,
} from "@/lib/wardrobe-vision";
import {
  notifyAgentPendingImages,
  notifyWardrobePhotosReceived,
} from "@/lib/vauto-agent-client";
import { WARDROBE_BULK_PHOTO_PICK_EVENT } from "@/lib/agent-wardrobe-bulk-dialogue";
import { profileItemsToWardrobeDrafts } from "@/lib/agent-wardrobe-bridge";
import type { WardrobeProfileImportItem } from "@/lib/wardrobe-profile-importer";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { getSafeImageUrl } from "@/lib/utils";
import { WardrobeProfileImporter } from "@/components/clothing/WardrobeProfileImporter";
import { MagicMirrorPanel } from "@/components/clothing/MagicMirrorPanel";
import { ClothingWizardInlineGuide } from "@/components/clothing/ClothingWizardInlineGuide";
import {
  buildClothingWizardHint,
  isClothingWizardReady,
} from "@/lib/clothing-wizard-guidance";

const ACCENT = "#d946ef";
const SPINTA_BG = "#0a1128";
const SPINTA_CARD = "#131c38";

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
  onStageWardrobeBulk?: (items: WardrobeDraftItem[], voiceAnnouncement?: string) => void;
  onToast?: (message: string, type?: "success" | "error" | "info") => void;
  initialWardrobeItems?: WardrobeDraftItem[];
  initialWardrobeVoice?: string | null;
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

function WardrobeField({
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
    "w-full rounded-xl border border-slate-700 bg-[#1e293b] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-sky-500";
  return (
    <div className="px-4 py-3">
      <label className="mb-0.5 block text-xs text-slate-300">{label}</label>
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
  return <h2 className="mb-3 text-base font-semibold text-white">{children}</h2>;
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
  onStageWardrobeBulk,
  onToast,
  initialWardrobeItems,
  initialWardrobeVoice,
}: ClothingListingWizardProps) {
  const inSpintaCabinet = false;
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeDraftItem[]>(
    () => initialWardrobeItems ?? []
  );
  const [wardrobeAnalyzing, setWardrobeAnalyzing] = useState(false);
  const [wardrobePhotoPickSignal, setWardrobePhotoPickSignal] = useState(0);
  const [wardrobeVoice, setWardrobeVoice] = useState<string | null>(
    initialWardrobeVoice ?? null
  );
  const attrs = useMemo(() => draft.attributes ?? {}, [draft.attributes]);

  const categoryValue = readFashionCategory(attrs);
  const { group: categoryGroup, sub: categorySub } = parseFashionCategory(categoryValue);
  const sizeOptions = useMemo(
    () => (categoryGroup && categorySub ? sizesForFashionListing(categoryGroup, categorySub) : []),
    [categoryGroup, categorySub]
  );
  const selectedColors = attrArray(attrs, "colors").length
    ? attrArray(attrs, "colors")
    : attr(attrs, "color")
      ? [attr(attrs, "color")]
      : [];
  const shippingOptions = attrArray(attrs, "shipping");

  useEffect(() => {
    const onPickPhotos = () => {
      document.getElementById("wardrobe-photo-basket")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setWardrobePhotoPickSignal((n) => n + 1);
    };
    window.addEventListener(WARDROBE_BULK_PHOTO_PICK_EVENT, onPickPhotos);
    return () => window.removeEventListener(WARDROBE_BULK_PHOTO_PICK_EVENT, onPickPhotos);
  }, []);

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

  const canPublish = isClothingWizardReady({
    userName,
    hasPhoto: Boolean(previewImage),
    title: draft.title,
    categoryValue,
    size: attr(attrs, "size"),
    brand: attr(attrs, "brand"),
    condition: attr(attrs, "condition"),
    colorCount: selectedColors.length,
    price: draft.price,
  });

  const friendlyHint = useMemo(
    () =>
      buildClothingWizardHint({
        userName,
        hasPhoto: Boolean(previewImage),
        title: draft.title,
        categoryValue,
        size: attr(attrs, "size"),
        brand: attr(attrs, "brand"),
        condition: attr(attrs, "condition"),
        colorCount: selectedColors.length,
        price: draft.price,
      }),
    [
      userName,
      previewImage,
      draft.title,
      draft.price,
      categoryValue,
      attrs,
      selectedColors.length,
    ]
  );

  const handleSaveDraft = () => {
    saveClothingListingDraft(
      { ...draft, category: "clothing", attributes: attrs },
      previewImage
    );
    onToast?.("Ruošinys išsaugotas. Galite tęsti vėliau.", "success");
  };

  const handlePublish = () => {
    if (!canPublish) {
      if (!previewImage) {
        onToast?.("Pridėkite bent vieną nuotrauką.", "info");
        return;
      }
      if (friendlyHint) onToast?.(friendlyHint, "info");
      return;
    }
    onUpdate({ category: "clothing" });
    clearClothingListingDraft();
    onPublish();
  };

  const runWardrobeVisionBatch = async (imageDataUrls: string[]) => {
    if (!imageDataUrls.length) return;
    setWardrobeAnalyzing(true);
    setWardrobeItems([]);
    try {
      const merged: WardrobeDraftItem[] = [];
      for (const imageDataUrl of imageDataUrls) {
        const result = await analyzeWardrobePhoto({
          imageDataUrl,
          userName,
        });
        if (!result?.items.length) continue;
        for (const item of result.items) {
          const duplicate = merged.some(
            (existing) =>
              existing.title === item.title &&
              existing.size === item.size &&
              existing.color === item.color
          );
          if (!duplicate) merged.push(item);
        }
      }

      if (!merged.length) {
        onToast?.(
          "Nuotraukose nematau aiškių drabužių — įkelkite kitas nuotraukas arba profilio nuorodą.",
          "info"
        );
        return;
      }

      const voice =
        imageDataUrls.length > 1
          ? `AI aptiko ${merged.length} drabužius iš ${imageDataUrls.length} nuotraukų.`
          : `AI aptiko ${merged.length} drabužį.`;

      setWardrobeItems(merged);
      setWardrobeVoice(voice);
      speakBuddyMessage(voice, { enabled: true });
      onToast?.(voice, "info");
      notifyAgentPendingImages(imageDataUrls);
      onStageWardrobeBulk?.(merged, voice);
      notifyWardrobePhotosReceived(merged.length, imageDataUrls.length);

      if (merged.length === 1) {
        const single = wardrobeItemToDraft(
          merged[0]!,
          draft.contact,
          draft.location
        );
        onUpdate(single);
        onMediaChange({ imageDataUrl: imageDataUrls[0] });
        for (const [key, val] of Object.entries(single.attributes ?? {})) {
          onAttributeChange(key, val as string | string[]);
        }
      } else if (imageDataUrls[0]) {
        onMediaChange({ imageDataUrl: imageDataUrls[0] });
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

  const handleProfileImport = (
    drafts: AiExtractedListing[],
    voice: string,
    sourceItems?: WardrobeProfileImportItem[]
  ) => {
    speakBuddyMessage(voice, { enabled: true });
    const wardrobeFromProfile = sourceItems?.length
      ? profileItemsToWardrobeDrafts(sourceItems)
      : [];

    if (wardrobeFromProfile.length > 1) {
      setWardrobeItems(wardrobeFromProfile);
      setWardrobeVoice(voice);
      onStageWardrobeBulk?.(wardrobeFromProfile, voice);
      onToast?.("Peržiūrėkite importuotus drabužius žemiau — patvirtinkite, kai viskas tinka.", "info");
      return;
    }

    if (wardrobeFromProfile.length === 1) {
      const single = wardrobeItemToDraft(
        wardrobeFromProfile[0]!,
        draft.contact,
        draft.location || defaultLocation
      );
      onUpdate(single);
      for (const [key, val] of Object.entries(single.attributes ?? {})) {
        onAttributeChange(key, val as string | string[]);
      }
      onStageWardrobeBulk?.(wardrobeFromProfile, voice);
      return;
    }

    if (drafts.length > 1) {
      onToast?.("Peržiūrėkite importuotus drabužius — patvirtinkite publikavimą.", "info");
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
    onAttributeChange(FASHION_CATEGORY_ATTR, formatFashionCategory(group, sub));
    if (group === "Moterims" || group === "Vyrams" || group === "Vaikams") {
      onAttributeChange("clothingType", group);
    }
    setShowCategoryPicker(false);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (initialWardrobeItems?.length) {
      setWardrobeItems(initialWardrobeItems);
    }
    if (initialWardrobeVoice) {
      setWardrobeVoice(initialWardrobeVoice);
    }
  }, [initialWardrobeItems, initialWardrobeVoice]);

  return (
    <div className="listing-wizard-overlay chameleon-wizard-shell spinta-listing-wizard bg-[#0a1128] text-white min-h-screen">
      <div className="mx-auto w-full max-w-lg bg-[#0a1128] text-white min-h-screen pb-8">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-[#0a1128] px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              V
            </span>
            <span className="text-sm font-light text-slate-200">Įkelti prekę</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-800"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <WardrobeFlowAgentStrip />

        <div className="px-4 pt-5">
          {manualFallback && (
            <ClothingWizardInlineGuide message="Kai kurie laukai dar tušti — padėsiu juos užpildyti švelniai, žingsnis po žingsnio." />
          )}

          <ClothingWizardInlineGuide
            message={canPublish || !previewImage ? null : friendlyHint}
          />

          <WardrobeProfileImporter
            userName={userName}
            defaultLocation={draft.location || defaultLocation}
            contact={draft.contact}
            inSpintaCabinet={inSpintaCabinet}
            onImportReady={handleProfileImport}
            onToast={onToast}
          />

          <SectionTitle>Nuotraukos</SectionTitle>
          <div
            id="wardrobe-photo-basket"
            className="mb-6 rounded-2xl border border-dashed border-fuchsia-500/40 p-4"
            style={{ backgroundColor: SPINTA_CARD }}
          >
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getSafeImageUrl(previewImage)}
                alt=""
                className="mb-3 max-h-56 w-full rounded-xl object-cover"
              />
            )}
            <ListingGalleryFileInput
              requestConsent={requestMediaConsent}
              openPickerSignal={wardrobePhotoPickSignal}
              className="flex w-full flex-col items-center justify-center gap-3 py-6 text-fuchsia-400"
              label={previewImage ? "+ Pridėti nuotraukų" : "+ Įkelti nuotraukų krepšelį"}
              hint="Galite pasirinkti kelias nuotraukas vienu metu"
              onFilesSelected={(files) => {
                void readGalleryFilesAsDataUrls(files).then((dataUrls) => {
                  if (!dataUrls.length) return;
                  onMediaChange({ imageDataUrl: dataUrls[0] });
                  void runWardrobeVisionBatch(dataUrls);
                });
              }}
            />
            {wardrobeAnalyzing && (
              <p className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-fuchsia-400" />
                Smart Wardrobe Vision analizuoja nuotraukų krepšelį…
              </p>
            )}
          </div>

          {wardrobeItems.length > 1 && (
            <div
              id="wardrobe-bulk-review"
              className="mb-6 rounded-2xl border border-fuchsia-500/30 p-4"
              style={{ backgroundColor: SPINTA_CARD }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-fuchsia-400" />
                <p className="text-sm font-semibold text-white">
                  Paruošta peržiūrai: {wardrobeItems.length} prekės
                </p>
              </div>
              {wardrobeVoice && (
                <p className="mb-3 text-xs italic text-slate-300">{wardrobeVoice}</p>
              )}
              <div className="space-y-2">
                {wardrobeItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyWardrobeItem(item)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-600 px-3 py-2.5 text-left transition hover:border-fuchsia-400"
                    style={{ backgroundColor: SPINTA_BG }}
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.categorySub} · {item.size} · {item.color} · {item.suggestedPrice} €
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
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
          <div
            className="mb-6 overflow-hidden rounded-2xl border border-slate-700"
            style={{ backgroundColor: SPINTA_CARD }}
          >
            <WardrobeField
              label="Pavadinimas"
              value={draft.title}
              onChange={(v) => onUpdate({ title: v })}
              placeholder="Papasakok pirkėjams, ką parduodi"
            />
            <div className="border-t border-slate-700" />
            <WardrobeField
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
          <div
            className="mb-3 overflow-hidden rounded-2xl border border-slate-700"
            style={{ backgroundColor: SPINTA_CARD }}
          >
            <button
              type="button"
              onClick={() => setShowCategoryPicker((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-4 text-left"
            >
              <div>
                <p className="text-xs text-slate-400">Kategorija</p>
                <p className={`text-sm ${categoryValue ? "text-white" : "text-slate-500"}`}>
                  {categoryValue || "Pasirink kategoriją"}
                </p>
              </div>
              <ChevronRight
                className={`h-5 w-5 text-slate-500 transition ${showCategoryPicker ? "rotate-90" : ""}`}
              />
            </button>
          </div>

          {showCategoryPicker && (
            <div
              className="mb-4 overflow-hidden rounded-2xl border border-slate-700"
              style={{ backgroundColor: SPINTA_CARD }}
            >
              {Object.keys(FASHION_CATEGORY_TREE).map((group) => (
                <div key={group} className="border-b border-slate-700 last:border-0">
                  <p
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400"
                    style={{ backgroundColor: SPINTA_BG }}
                  >
                    {group}
                  </p>
                  {subcategoriesFor(group).map((sub) => (
                    <button
                      key={`${group}-${sub}`}
                      type="button"
                      onClick={() => selectCategory(group, sub)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-800/60 ${
                        categoryGroup === group && categorySub === sub
                          ? "bg-fuchsia-900/30 font-medium text-fuchsia-300"
                          : "text-slate-200"
                      }`}
                    >
                      {sub}
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {categoryValue && (
            <div
              className="mb-6 space-y-3 rounded-2xl border border-slate-700 p-4"
              style={{ backgroundColor: SPINTA_CARD }}
            >
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Dydis *</label>
                <div className="flex flex-wrap gap-2">
                  {(sizeOptions.length ? sizeOptions : ["XS", "S", "M", "L", "XL"]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onAttributeChange("size", size)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        attr(attrs, "size") === size
                          ? "border-fuchsia-500 bg-fuchsia-600 text-white"
                          : "border-slate-600 bg-[#0a1128] text-slate-200"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Prekės ženklas *</label>
                <input
                  type="text"
                  list="fashion-brands"
                  value={attr(attrs, "brand")}
                  onChange={(e) => onAttributeChange("brand", e.target.value)}
                  placeholder="Zara, Nike…"
                  className="w-full rounded-xl border border-fuchsia-500/40 bg-[#0a1128] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-fuchsia-400"
                />
                <datalist id="fashion-brands">
                  {POPULAR_BRANDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Būklė *</label>
                <select
                  value={attr(attrs, "condition")}
                  onChange={(e) => onAttributeChange("condition", e.target.value)}
                  className="w-full rounded-xl border border-fuchsia-500/40 bg-[#0a1128] px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-400"
                >
                  <option value="">Pasirinkite būklę</option>
                  {FASHION_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Spalva * (galima kelios)</label>
                <div className="flex flex-wrap gap-2">
                  {CLOTHING_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => toggleColor(color)}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        selectedColors.includes(color)
                          ? "border-fuchsia-500 bg-fuchsia-600 text-white"
                          : "border-slate-600 text-slate-200"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Siuntimo būdai</label>
                <div className="space-y-2">
                  {FASHION_SHIPPING_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={shippingOptions.includes(opt)}
                        onChange={() => toggleShipping(opt)}
                        className="accent-fuchsia-500"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <SectionTitle>Kaina</SectionTitle>
          <div
            className="mb-6 overflow-hidden rounded-2xl border border-slate-700 px-4 py-3"
            style={{ backgroundColor: SPINTA_CARD }}
          >
            <label className="mb-0.5 block text-xs text-slate-400">Kaina</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step={0.01}
                value={draft.price > 0 ? draft.price : ""}
                onChange={(e) => onUpdate({ price: Number(e.target.value) || 0 })}
                placeholder="0,00"
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-lg text-white outline-none placeholder:text-slate-500"
              />
              <span className="text-lg text-slate-400">€</span>
            </div>
          </div>

          <div
            className="mb-6 flex items-center justify-between rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300"
            style={{ backgroundColor: SPINTA_CARD }}
          >
            <span>Ką manai apie įkėlimo procesą?</span>
            <button
              type="button"
              onClick={() => onToast?.("Ačiū už atsiliepimą!", "info")}
              className="shrink-0 rounded-full border border-fuchsia-500 px-3 py-1 text-xs font-medium text-fuchsia-300"
            >
              Palikti atsiliepimą
            </button>
          </div>

          <ListingPublishSocialOptions className="mb-4 spinta-social-options" />

          <button
            type="button"
            onClick={handlePublish}
            className={`mb-3 w-full rounded-full py-3.5 text-base font-semibold text-white transition ${
              canPublish ? "" : "opacity-90"
            }`}
            style={{ backgroundColor: ACCENT }}
          >
            {canPublish ? "Įkelti" : "Tęsti su AI pagalba"}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="w-full rounded-full border border-fuchsia-500 py-3.5 text-base font-medium text-fuchsia-300"
          >
            Išsaugoti ruošinį
          </button>
        </div>
      </div>
    </div>
  );
}

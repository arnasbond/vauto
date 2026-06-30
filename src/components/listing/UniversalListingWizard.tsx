"use client";

import { ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiExtractedListing } from "@/lib/types";
import type { WardrobeDraftItem } from "@/lib/wardrobe-vision";
import { FlowAgentStrip } from "@/components/agent/FlowAgentStrip";
import { AdaptiveConfirmation } from "@/components/adaptive-confirmation/AdaptiveConfirmation";
import { WizardCategoryPicker } from "@/components/listing/WizardCategoryPicker";
import { PhotoClarificationPanel } from "@/components/seller/PhotoClarificationPanel";
import { DynamicAttributeBasket } from "@/components/listing/DynamicAttributeBasket";
import {
  buildUniversalListingFields,
  getUniversalCategoryLabel,
} from "@/lib/universal-listing-fields";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import {
  ListingGalleryFileInput,
  readGalleryFilesAsDataUrls,
} from "@/components/listing/ListingGalleryFileInput";
import {
  analyzeWardrobePhoto,
  wardrobeItemToDraft,
} from "@/lib/wardrobe-vision";
import { notifyWardrobePhotosReceived } from "@/lib/vauto-agent-client";
import { wardrobeBulkToDrafts } from "@/lib/agent-wardrobe-bridge";
import {
  resolveFlowUiSkin,
  flowSkinToAgentStripVariant,
  type FlowUiSkinTokens,
} from "@/lib/flow-ui-skin";
import { WARDROBE_BULK_PHOTO_PICK_EVENT } from "@/lib/agent-flow-wizard-orchestrator";
import { cn } from "@/lib/cn";

export interface UniversalListingWizardProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  videoUrl: string;
  userPrompt: string | null;
  manualFallback?: boolean;
  userName?: string;
  userCity?: string;
  userPhone?: string;
  pendingWardrobeBulkItems?: WardrobeDraftItem[] | null;
  pendingWardrobeVoice?: string | null;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null; videoUrl?: string }) => void;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
  onPublishBulk?: (drafts: AiExtractedListing[]) => void;
  onStageWardrobeBulk?: (items: WardrobeDraftItem[], voiceAnnouncement?: string) => void;
  onPhotoCaptured?: (dataUrl: string) => void;
}

/**
 * P8 — single universal listing magistralė for all verticals.
 * Replaces category-specific wizards (Vehicle, Clothing, RE, Jobs, Services, General).
 */
export function UniversalListingWizard({
  draft,
  previewImage,
  videoUrl,
  userPrompt,
  manualFallback = false,
  userName,
  userCity,
  userPhone,
  pendingWardrobeBulkItems,
  pendingWardrobeVoice,
  onUpdate,
  onAttributeChange,
  onMediaChange,
  requestMediaConsent,
  onCancel,
  onPublish,
  onPublishBulk,
  onStageWardrobeBulk,
  onPhotoCaptured,
}: UniversalListingWizardProps) {
  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const categoryLabel = getUniversalCategoryLabel(draft.category);
  const attributes = draft.attributes ?? {};

  const { dynamicFields } = useMemo(
    () => buildUniversalListingFields(draft.category, attributes),
    [draft.category, attributes]
  );

  const [wardrobeItems, setWardrobeItems] = useState<WardrobeDraftItem[]>(
    () => pendingWardrobeBulkItems ?? []
  );
  const [wardrobeVoice, setWardrobeVoice] = useState(pendingWardrobeVoice ?? "");
  const [wardrobeAnalyzing, setWardrobeAnalyzing] = useState(false);
  const [photoPickSignal, setPhotoPickSignal] = useState(0);

  useEffect(() => {
    if (pendingWardrobeBulkItems?.length) {
      setWardrobeItems(pendingWardrobeBulkItems);
    }
  }, [pendingWardrobeBulkItems]);

  useEffect(() => {
    if (pendingWardrobeVoice) setWardrobeVoice(pendingWardrobeVoice);
  }, [pendingWardrobeVoice]);

  useEffect(() => {
    const openPicker = () => setPhotoPickSignal((n) => n + 1);
    window.addEventListener(WARDROBE_BULK_PHOTO_PICK_EVENT, openPicker);
    return () => window.removeEventListener(WARDROBE_BULK_PHOTO_PICK_EVENT, openPicker);
  }, []);

  const runWardrobeVisionBatch = useCallback(
    async (dataUrls: string[]) => {
      if (!dataUrls.length) return;
      setWardrobeAnalyzing(true);
      try {
        const collected: WardrobeDraftItem[] = [];
        for (const url of dataUrls.slice(0, 6)) {
          const result = await analyzeWardrobePhoto({
            imageDataUrl: url,
            userName,
          });
          if (result?.items?.length) collected.push(...result.items);
        }
        if (!collected.length) return;
        setWardrobeItems(collected);
        onStageWardrobeBulk?.(collected, wardrobeVoice || undefined);
        notifyWardrobePhotosReceived(collected.length, dataUrls.length);
        const first = wardrobeItemToDraft(
          collected[0]!,
          userPhone ?? draft.contact,
          userCity ?? draft.location
        );
        onUpdate(first);
      } finally {
        setWardrobeAnalyzing(false);
      }
    },
    [
      draft.contact,
      draft.location,
      onStageWardrobeBulk,
      onUpdate,
      userCity,
      userPhone,
      wardrobeVoice,
    ]
  );

  const applyWardrobeItem = (item: WardrobeDraftItem) => {
    const next = wardrobeItemToDraft(
      item,
      userPhone ?? draft.contact,
      userCity ?? draft.location
    );
    onUpdate(next);
  };

  const handlePublishAllWardrobe = () => {
    if (!onPublishBulk || !wardrobeItems.length) return;
    const drafts = wardrobeBulkToDrafts(
      wardrobeItems,
      userPhone ?? draft.contact,
      userCity ?? draft.location
    );
    onPublishBulk(drafts);
  };

  const isClothing = adaptiveKey === "clothing";
  const skin: FlowUiSkinTokens = useMemo(
    () => resolveFlowUiSkin({ category: isClothing ? "clothing" : draft.category }),
    [isClothing, draft.category]
  );
  const stripVariant = flowSkinToAgentStripVariant(skin);

  return (
    <div
      className={`universal-listing-wizard listing-wizard-overlay min-h-screen text-white ${skin.rootClass}`}
      style={{ backgroundColor: skin.shellBg }}
    >
      <div className="mx-auto w-full max-w-lg min-h-screen pb-36">
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3",
            skin.variant === "spinta" ? "border-fuchsia-500/30" : "border-slate-700"
          )}
          style={{ backgroundColor: skin.shellBg }}
        >
          <div className="flex items-center gap-2">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: skin.badgeBg }}
            >
              {skin.variant === "spinta" ? "✨" : "V"}
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{skin.headerTitle}</p>
              <p className={`text-[10px] uppercase tracking-wide ${skin.headerSubtitle}`}>
                {skin.variant === "spinta" ? "Tavo AI sekretorė" : categoryLabel}
              </p>
            </div>
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

        <FlowAgentStrip variant={stripVariant} category={draft.category} />

        <div className="px-4 pt-3">
          <PhotoClarificationPanel
            draft={draft}
            onSelectChip={(chip) => {
              const label = chip.replace(/^Parduoti\s+/i, "").trim();
              onUpdate({
                title: label ? `Parduodamas ${label}` : chip,
                description: chip,
                confidence: Math.max(draft.confidence ?? 0, 0.6),
              });
            }}
          />
          <WizardCategoryPicker
            category={draft.category}
            onChange={(cat) => onUpdate({ category: cat })}
          />

          {isClothing && (
            <div
              id="wardrobe-photo-basket"
              className={`mb-4 rounded-2xl border border-dashed p-4 ${skin.borderDashed}`}
              style={{ backgroundColor: skin.cardBg }}
            >
              <ListingGalleryFileInput
                requestConsent={requestMediaConsent}
                openPickerSignal={photoPickSignal}
                className={`flex w-full flex-col items-center justify-center gap-2 py-5 ${skin.basketLabel}`}
                label="+ Įkelti nuotraukų krepšelį"
                hint="Galite pasirinkti kelias nuotraukas — AI paruoš juodraščius"
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
                  <Loader2 className={`h-4 w-4 animate-spin ${skin.composerAccentIcon}`} />
                  Smart Wardrobe Vision analizuoja nuotraukų krepšelį…
                </p>
              )}
            </div>
          )}

          {wardrobeItems.length > 1 && (
            <div
              id="wardrobe-bulk-review"
              className={`mb-4 rounded-2xl border p-4 ${skin.border}`}
              style={{ backgroundColor: skin.cardBg }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${skin.composerAccentIcon}`} />
                <p className="text-sm font-semibold">Paruošta: {wardrobeItems.length} prekės</p>
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
                    className="flex w-full items-center justify-between rounded-xl border border-slate-600 px-3 py-2.5 text-left hover:border-fuchsia-400"
                    style={{ backgroundColor: skin.shellBg }}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.categorySub} · {item.size} · {item.suggestedPrice} €
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
                  style={{ backgroundColor: skin.accent }}
                >
                  Patvirtinti visus {wardrobeItems.length} skelbimus
                </button>
              )}
            </div>
          )}

          <DynamicAttributeBasket
            fields={dynamicFields}
            attributes={attributes}
            onChange={onAttributeChange}
            skin={skin}
          />

          <AdaptiveConfirmation
            draft={draft}
            previewImage={previewImage}
            videoUrl={videoUrl}
            userPrompt={userPrompt}
            speakEnabled={false}
            manualFallback={manualFallback}
            universalMode
            onUpdate={onUpdate}
            onAttributeChange={onAttributeChange}
            onMediaChange={onMediaChange}
            requestMediaConsent={requestMediaConsent}
            onCancel={onCancel}
            onPublish={onPublish}
            onPhotoCaptured={onPhotoCaptured}
          />
        </div>
      </div>
    </div>
  );
}

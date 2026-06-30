"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdaptiveConfig,
  getMissingCriticalFields,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import { filterFieldsForListingCategory } from "@/lib/listing-attribute-isolation";
import type { AiExtractedListing } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { PriceAdviceCard } from "@/components/listing/PriceAdviceCard";
import { SELLER_TYPES } from "@/lib/general-catalog";
import { verifyVin } from "@/lib/trust";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { BaseFieldsEditor } from "./BaseFieldsEditor";
import { CategoryFieldsEditor } from "./CategoryFieldsEditor";
import { DraftMediaEditor } from "./DraftMediaEditor";
import { ListingPhotoRequiredBanner } from "@/components/listing/ListingPhotoRequiredBanner";
import { ConversationalReport } from "@/components/conversational/ConversationalReport";
import { VehicleLookupCard } from "@/components/vehicle/VehicleLookupCard";
import { useListingWizard } from "@/hooks/useListingWizard";
import { buildSellerQuickActions, type BuddyActionId } from "@/lib/buddy-messages";
import { capturePhoto } from "@/lib/native-media";
import { logBuddyState } from "@/lib/buddy-voice";

interface AdaptiveConfirmationProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  videoUrl: string;
  userPrompt: string | null;
  speakEnabled: boolean;
  manualFallback?: boolean;
  /** P8 — universal magistralė: vienas layout visoms kategorijoms, be chameleon šakų */
  universalMode?: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onMediaChange: (patch: { imageDataUrl?: string | null; videoUrl?: string }) => void;
  requestMediaConsent: (onGranted: () => void) => void;
  onCancel: () => void;
  onPublish: () => void;
  onPhotoCaptured?: (dataUrl: string) => void;
}

export function AdaptiveConfirmation({
  draft,
  previewImage,
  videoUrl,
  userPrompt,
  speakEnabled,
  manualFallback = false,
  universalMode = false,
  onUpdate,
  onAttributeChange,
  onMediaChange,
  requestMediaConsent,
  onCancel,
  onPublish,
  onPhotoCaptured,
}: AdaptiveConfirmationProps) {
  const { chameleonTheme } = useVauto();
  const theme = getChameleonTheme(universalMode ? "flux" : chameleonTheme);
  const detailsAnchorRef = useRef<HTMLDivElement>(null);
  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attributes = useMemo(() => draft.attributes ?? {}, [draft.attributes]);
  const needsPrice = draft.price <= 0;
  const hasPhoto = Boolean(previewImage);

  const missingKeys = getMissingCriticalFields(adaptiveKey, attributes, {
    price: draft.price,
    description: draft.description,
  });
  const needsPhotoForPublish = !hasPhoto;
  const needsSellerType = !String(attributes.sellerType ?? "").trim();
  const canPublish =
    missingKeys.length === 0 &&
    !needsPrice &&
    draft.title.trim().length >= 2 &&
    !needsPhotoForPublish &&
    !needsSellerType;

  const { aiFilledBase, aiFilledAttrs, showAiBadges } = useMemo(() => {
    if (manualFallback) {
      return {
        aiFilledBase: new Set<string>(),
        aiFilledAttrs: new Set<string>(),
        showAiBadges: false,
      };
    }
    const base = new Set<string>();
    if (draft.title.trim()) base.add("title");
    if (draft.price > 0) base.add("price");
    if (draft.location.trim()) base.add("location");
    if (draft.contact?.trim()) base.add("contact");
    if (draft.description?.trim()) base.add("description");

    const attrsFilled = new Set<string>();
    for (const [key, val] of Object.entries(attributes)) {
      if (Array.isArray(val) ? val.length > 0 : Boolean(String(val ?? "").trim())) {
        attrsFilled.add(key);
      }
    }
    return { aiFilledBase: base, aiFilledAttrs: attrsFilled, showAiBadges: true };
  }, [manualFallback, draft.title, draft.price, draft.location, draft.contact, draft.description, attributes]);

  const [showAiFilledBadges, setShowAiFilledBadges] = useState(showAiBadges);
  useEffect(() => {
    if (!showAiBadges) {
      setShowAiFilledBadges(false);
      return;
    }
    setShowAiFilledBadges(true);
    const t = window.setTimeout(() => setShowAiFilledBadges(false), 3000);
    return () => window.clearTimeout(t);
  }, [showAiBadges]);

  const scrollToDetails = () => {
    detailsAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const {
    analysis,
    buddyMessage,
    thread: wizardThread,
    handleWizardReply,
    priceAdvice,
  } = useListingWizard({
    draft,
    userPrompt,
    manualFallback,
    onUpdate,
    onAttributeChange,
    onFocusVin: scrollToDetails,
  });

  const quickActions = buildSellerQuickActions({
    missingKeys,
    hasPhoto,
    canPublish,
    needsPrice,
  });

  const publishLabel = manualFallback
    ? !canPublish
      ? "Užpildykite privalomus laukus"
      : "Publikuoti skelbimą"
    : !canPublish
      ? "Užpildykite privalomus laukus"
      : needsPrice
        ? "Įveskite kainą"
        : needsSellerType
          ? "Pasirinkite: privatus ar įmonė"
          : "Viskas gerai, publikuoti skelbimą";

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  const vinValue =
    typeof attributes.vin === "string" ? attributes.vin : undefined;
  const vinOk = vinValue ? verifyVin(vinValue) : false;

  const categoryFields = filterFieldsForListingCategory(
    draft.category,
    attributes,
    config.fields.filter(
      (f) => !(adaptiveKey === "vehicles" && f.key === "vin" && vinOk)
    )
  );

  const baseFields = universalMode
    ? (["title", "price", "location", "contact", "description"] as const)
    : chameleonTheme === "skelbiu" || chameleonTheme === "aruodas"
      ? (["price", "title", "location", "contact", "description"] as const)
      : config.baseFields;

  const handlePhotoCapture = useCallback(() => {
    requestMediaConsent(async () => {
      const photo = await capturePhoto();
      if (photo) onMediaChange({ imageDataUrl: photo.dataUrl });
    });
  }, [requestMediaConsent, onMediaChange]);

  const handleQuickAction = useCallback(
    (id: BuddyActionId) => {
      logBuddyState("idle", { context: "seller_quick_action", action: id });

      if (id === "photo") {
        handlePhotoCapture();
        scrollToDetails();
        return;
      }
      if (id === "publish") {
        onPublish();
        return;
      }
      if (id === "change_price" || id === "edit_details") {
        scrollToDetails();
        return;
      }
    },
    [handlePhotoCapture, onPublish]
  );

  const categorySection = categoryFields.length > 0 && (
    <div className={theme.panel}>
      {adaptiveKey === "vehicles" && vinValue && (
        <div className="mb-3 flex flex-col gap-2 border-b border-[#d0d7de] pb-3 dark:border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6b7280]">Kėbulo numeris (VIN)</span>
            {vinOk && (
              <span className="text-xs font-bold text-[#1a56db]">✅ Patikrintas fone</span>
            )}
          </div>
          <input
            type="text"
            value={vinValue}
            readOnly
            className="w-full rounded-lg border border-[#d0d7de] bg-[#f9fafb] p-2 text-xs text-[#374151]"
          />
        </div>
      )}
      {adaptiveKey === "vehicles" && (
        <VehicleLookupCard vin={vinValue} onApply={onUpdate} />
      )}

      {adaptiveKey === "services" && (
        <p className="mb-3 text-xs text-[#1565c0]">
          Pro paslaugų teikėjai gauna Verifikuoto meistro ženkliuką
        </p>
      )}

      <CategoryFieldsEditor
        fields={categoryFields}
        attributes={attributes}
        onChange={onAttributeChange}
        layout={layoutMap[config.layout]}
        missingKeys={missingKeys}
        variant="inline"
        appearance={universalMode ? "light" : "dark"}
        showAiFilled={showAiFilledBadges}
        aiFilledKeys={aiFilledAttrs}
      />
    </div>
  );

  const mediaBlock = (
    <div className={universalMode ? "rounded-2xl border border-slate-700 bg-[#131c38] p-3" : chameleonTheme === "wardrobe" ? "chameleon-wardrobe-media" : chameleonTheme === "aruodas" ? "chameleon-aruodas-media" : undefined}>
      <ListingPhotoRequiredBanner visible={needsPhotoForPublish} />
      <DraftMediaEditor
        previewImage={previewImage}
        videoUrl={videoUrl}
        onImageChange={(imageDataUrl) => {
          onMediaChange({ imageDataUrl });
          if (imageDataUrl && onPhotoCaptured) void onPhotoCaptured(imageDataUrl);
        }}
        onVideoUrlChange={(url) => onMediaChange({ videoUrl: url })}
        requestMediaConsent={requestMediaConsent}
      />
    </div>
  );

  const fieldsBlock = (
    <>
      <div className={`mb-4 rounded-xl border p-3 ${universalMode ? "border-slate-700 bg-[#131c38]" : "border-[#d0d7de] bg-[#f9fafb] dark:border-white/10 dark:bg-white/5"}`}>
        <p className="mb-2 text-xs font-medium text-[#374151] dark:text-white/70">Jūs esate:</p>
        <div className="flex flex-wrap gap-2">
          {SELLER_TYPES.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onAttributeChange("sellerType", opt)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                (attributes.sellerType || "Privatus asmuo") === opt
                  ? "bg-[#1167b1] text-white"
                  : "bg-white text-[#374151] ring-1 ring-[#d0d7de] dark:bg-white/10 dark:text-white/80"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {(attributes.sellerType || "").includes("Įmonė") && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-[#6b7280] dark:text-white/50">
              Įmonės pavadinimas
            </label>
            <input
              type="text"
              name="organization"
              autoComplete="organization"
              value={String(attributes.companyName ?? "")}
              onChange={(e) => onAttributeChange("companyName", e.target.value)}
              placeholder="UAB Pavadinimas"
              className="w-full rounded-lg border border-[#d0d7de] bg-white px-3 py-2 text-sm outline-none focus:border-[#1167b1] dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
          </div>
        )}
      </div>

      {universalMode ? (
        <>
          <BaseFieldsEditor
            draft={draft}
            fields={[...baseFields]}
            needsPrice={needsPrice}
            onUpdate={onUpdate}
            variant="inline"
            showAiFilled={showAiFilledBadges}
            aiFilledKeys={aiFilledBase}
          />
          {categorySection}
        </>
      ) : adaptiveKey === "vehicles" && chameleonTheme === "autoplius" ? (
        <>
          {categorySection}
          <BaseFieldsEditor
            draft={draft}
            fields={[...baseFields]}
            needsPrice={needsPrice}
            onUpdate={onUpdate}
            variant="inline"
            showAiFilled={showAiFilledBadges}
            aiFilledKeys={aiFilledBase}
          />
        </>
      ) : adaptiveKey === "real_estate" && chameleonTheme === "aruodas" ? (
        <>
          {categorySection}
          <BaseFieldsEditor
            draft={draft}
            fields={[...baseFields]}
            needsPrice={needsPrice}
            onUpdate={onUpdate}
            variant="inline"
            showAiFilled={showAiFilledBadges}
            aiFilledKeys={aiFilledBase}
          />
        </>
      ) : (
        <>
          <BaseFieldsEditor
            draft={draft}
            fields={[...baseFields]}
            needsPrice={needsPrice}
            onUpdate={onUpdate}
            variant="inline"
            showAiFilled={showAiFilledBadges}
            aiFilledKeys={aiFilledBase}
          />
          {categorySection}
        </>
      )}
      <PriceAdviceCard advice={priceAdvice} />
    </>
  );

  return (
    <ConversationalReport
      userPrompt={userPrompt}
      buddyMessage={buddyMessage}
      quickActions={quickActions}
      speakEnabled={speakEnabled && !manualFallback}
      manualFallback={manualFallback}
      canPublish={canPublish}
      publishLabel={publishLabel}
      portalStyleLabel={config.label}
      onQuickAction={handleQuickAction}
      onCancel={onCancel}
      onPublish={onPublish}
      wizardThread={wizardThread}
      wizardQuickReplies={analysis.quickReplies}
      onWizardReply={handleWizardReply}
    >
      <div ref={detailsAnchorRef}>
        {mediaBlock}
        {fieldsBlock}
      </div>
    </ConversationalReport>
  );
}

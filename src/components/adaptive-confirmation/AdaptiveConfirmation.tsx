"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdaptiveConfig,
  evaluateListingPublishValidation,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import {
  filterFieldsForListingCategory,
} from "@/lib/listing-attribute-isolation";
import { LISTING_PUBLISH_CTA } from "@/components/listing/ListingValidationBanner";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import { useVauto } from "@/context/VautoContext";
import { PriceAdviceCard } from "@/components/listing/PriceAdviceCard";
import { SELLER_TYPES } from "@/lib/general-catalog";
import { verifyVin } from "@/lib/trust";
import { getChameleonTheme } from "@/lib/chameleon-themes";
import { ProfileContactReviewCard } from "./ProfileContactReviewCard";
import { BaseFieldsEditor } from "./BaseFieldsEditor";
import { CategoryFieldsEditor } from "./CategoryFieldsEditor";
import { DraftMediaEditor } from "./DraftMediaEditor";
import { ListingPhotoRequiredBanner } from "@/components/listing/ListingPhotoRequiredBanner";
import { ConversationalReport } from "@/components/conversational/ConversationalReport";
import { VehicleLookupCard } from "@/components/vehicle/VehicleLookupCard";
import { BarcodeLookupCard } from "@/components/product/BarcodeLookupCard";
import { useVehicleAutoLookup } from "@/hooks/useVehicleAutoLookup";
import { useBarcodeAutoLookup } from "@/hooks/useBarcodeAutoLookup";
import { isBarcodeLookupEligibleCategory } from "@/lib/product-intelligence/barcode-utils";
import { useListingWizard } from "@/hooks/useListingWizard";
import { buildSellerQuickActions, type BuddyActionId } from "@/lib/buddy-messages";
import { capturePhoto } from "@/lib/native-media";
import { logBuddyState } from "@/lib/buddy-voice";
import { cn } from "@/lib/cn";
import { hasActivePhotoCategoryMismatch } from "@/lib/seller-photo-category-mismatch";
import { resolveDraftContact, hasProfileListingContact } from "@/lib/profile-listing-sync";

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
  photoCategoryMismatch?: { fromCategory: ListingCategory; toCategory: ListingCategory } | null;
  onPhotoMismatchRevert?: () => void;
  onPhotoMismatchAccept?: () => void;
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
  photoCategoryMismatch = null,
  onPhotoMismatchRevert,
  onPhotoMismatchAccept,
}: AdaptiveConfirmationProps) {
  const { chameleonTheme, user, isAuthenticated, showToast } = useVauto();
  const theme = getChameleonTheme(universalMode ? "flux" : chameleonTheme);
  const detailsAnchorRef = useRef<HTMLDivElement>(null);
  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attributes = useMemo(() => draft.attributes ?? {}, [draft.attributes]);
  const needsPrice = draft.price <= 0;
  const hasPhoto = Boolean(previewImage);
  const profileContactReady =
    isAuthenticated && hasProfileListingContact(user) && !manualFallback;
  const profilePhone =
    String(attributes.phone ?? user.phone ?? "").trim() || user.phone?.trim() || "";
  const profileEmail =
    String(attributes.email ?? user.email ?? "").trim() || user.email?.trim() || "";
  const resolvedContact = resolveDraftContact(draft, user);

  const publishValidation = useMemo(
    () =>
      evaluateListingPublishValidation(
        draft.category,
        {
          title: draft.title,
          price: draft.price,
          description: draft.description,
          contact: resolvedContact,
          attributes,
        },
        { hasPhoto, conversational: !manualFallback, profileContact: resolvedContact }
      ),
    [draft.category, draft.title, draft.price, draft.description, resolvedContact, attributes, hasPhoto, manualFallback]
  );

  const { missingKeys, canPublish, needsPhotoForPublish, validationIssues } =
    useMemo(
      () => ({
        missingKeys: publishValidation.missingKeys,
        canPublish: publishValidation.canPublish,
        needsPhotoForPublish: publishValidation.needsPhoto,
        validationIssues: publishValidation.validationIssues,
      }),
      [publishValidation]
    );

  const activePhotoMismatch = hasActivePhotoCategoryMismatch(photoCategoryMismatch);
  const publishBlocked = !canPublish || activePhotoMismatch;

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
    photoCategoryMismatch,
    onPhotoMismatchRevert,
    onPhotoMismatchAccept,
    onUpdate,
    onAttributeChange,
    onFocusVin: scrollToDetails,
  });

  const quickActions = activePhotoMismatch
    ? []
    : buildSellerQuickActions({
        missingKeys,
        hasPhoto,
        canPublish,
        needsPrice,
      });

  const publishLabel = LISTING_PUBLISH_CTA;

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  const vinValue =
    typeof attributes.vin === "string" ? attributes.vin : undefined;
  const vinFormatOk = vinValue ? verifyVin(vinValue) : false;

  const vehicleLookup = useVehicleAutoLookup(
    attributes,
    adaptiveKey === "vehicles",
    onUpdate
  );

  const barcodeLookup = useBarcodeAutoLookup(
    draft.category,
    attributes,
    { title: draft.title, description: draft.description },
    isBarcodeLookupEligibleCategory(draft.category) && !manualFallback,
    onUpdate,
    (msg) => showToast(msg)
  );

  const isVinVerified = draft.isVinVerified === true;
  const vehicleDataSource =
    typeof attributes.vehicleDataSource === "string"
      ? attributes.vehicleDataSource
      : undefined;
  const officialVinBadge =
    isVinVerified && vehicleDataSource === "regitra-plate-api"
      ? "Oficialūs Regitros duomenys"
      : isVinVerified && vehicleDataSource === "vin-decoder-nhtsa"
        ? "Oficialūs NHTSA duomenys"
        : null;

  const categoryFields = filterFieldsForListingCategory(
    draft.category,
    attributes,
    config.fields.filter(
      (f) => !(adaptiveKey === "vehicles" && f.key === "vin" && vinFormatOk)
    )
  );

  const baseFields = universalMode
    ? (["title", "price", "location", "contact", "description"] as const)
    : chameleonTheme === "skelbiu" || chameleonTheme === "aruodas"
      ? (["price", "title", "location", "contact", "description"] as const)
      : config.baseFields;

  const visibleBaseFields = profileContactReady
    ? baseFields.filter((key) => key !== "contact" && key !== "location")
    : baseFields;

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
    <div className={universalMode ? "mt-4 border-t border-slate-100 pt-4" : theme.panel}>
      {adaptiveKey === "vehicles" && vinValue && (
        <div className="mb-3 flex flex-col gap-2 border-b border-[#d0d7de] pb-3 dark:border-white/5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#6b7280]">Kėbulo numeris (VIN)</span>
            {officialVinBadge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">
                ✓ {officialVinBadge}
              </span>
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
        <VehicleLookupCard
          loading={vehicleLookup.loading}
          result={vehicleLookup.result}
          isVinVerified={isVinVerified}
        />
      )}

      {isBarcodeLookupEligibleCategory(draft.category) && (
        <BarcodeLookupCard
          loading={barcodeLookup.loading}
          result={barcodeLookup.result}
          barcode={barcodeLookup.barcode}
        />
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
    <div
      className={cn(
        "relative z-10 pointer-events-auto",
        universalMode ? "rounded-2xl border border-slate-200 bg-white p-3" : chameleonTheme === "wardrobe" ? "chameleon-wardrobe-media" : chameleonTheme === "aruodas" ? "chameleon-aruodas-media" : undefined
      )}
    >
      <ListingPhotoRequiredBanner visible={needsPhotoForPublish} />
      <DraftMediaEditor
        previewImage={previewImage}
        videoUrl={videoUrl}
        appearance={universalMode ? "light" : "dark"}
        onImageChange={(imageDataUrl) => {
          onMediaChange({ imageDataUrl });
          if (imageDataUrl && onPhotoCaptured) void onPhotoCaptured(imageDataUrl);
        }}
        onVideoUrlChange={(url) => onMediaChange({ videoUrl: url })}
      />
    </div>
  );

  const fieldsBlock = (
    <>
      <div className={`mb-4 rounded-xl border p-3 ${universalMode ? "border-slate-200 bg-white" : "border-[#d0d7de] bg-[#f9fafb] dark:border-white/10 dark:bg-white/5"}`}>
        <p className={`mb-2 text-xs font-semibold ${universalMode ? "text-slate-800" : "font-medium text-slate-800 dark:text-white/70"}`}>Jūs esate:</p>
        <div className="flex flex-wrap gap-2">
          {SELLER_TYPES.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onAttributeChange("sellerType", opt)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                (attributes.sellerType || "Privatus asmuo") === opt
                  ? "bg-[#1167b1] text-white"
                  : universalMode
                    ? "bg-white text-slate-800 ring-1 ring-slate-400"
                    : "bg-white text-slate-800 ring-1 ring-[#d0d7de] dark:bg-white/10 dark:text-white/80"
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

      {profileContactReady && (
        <ProfileContactReviewCard
          draft={draft}
          phone={profilePhone}
          email={profileEmail}
          appearance={universalMode ? "light" : "dark"}
          onUpdate={onUpdate}
        />
      )}

      {universalMode ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <BaseFieldsEditor
            draft={draft}
            fields={[...visibleBaseFields]}
            needsPrice={needsPrice}
            onUpdate={onUpdate}
            variant="inline"
            appearance="light"
            showAiFilled={showAiFilledBadges}
            aiFilledKeys={aiFilledBase}
          />
          {categorySection}
        </div>
      ) : adaptiveKey === "vehicles" && chameleonTheme === "autoplius" ? (
        <>
          {categorySection}
          <BaseFieldsEditor
            draft={draft}
            fields={[...visibleBaseFields]}
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
            fields={[...visibleBaseFields]}
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
            fields={[...visibleBaseFields]}
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
      speakEnabled={speakEnabled && !manualFallback && !activePhotoMismatch}
      manualFallback={manualFallback}
      isolatedMismatchDialog={activePhotoMismatch}
      embeddedInWizard={universalMode}
      canPublish={!publishBlocked}
      publishLabel={publishLabel}
      validationIssues={validationIssues}
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

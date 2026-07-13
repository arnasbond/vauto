"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useVautoBridge } from "@/context/VautoBridge";
import {
  extractCombined,
  extractFromImage,
  extractFromText,
} from "@/lib/client-api";
import { isDuplicateListing } from "@/lib/dedup";
import {
  ensureClientDraftId,
  listingIdFromClientDraftId,
  readClientDraftId,
} from "@/lib/listing-draft-id";
import { moderateListing } from "@/lib/moderation";
import { compressDataUrl, resolveImageForUpload } from "@/lib/native-media";
import { getUserCoords } from "@/lib/geolocation";
import { distanceToListing, enrichListingCoords, geocodeLocation } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceProvider, verifyVin } from "@/lib/trust";
import { apiCreateListing, apiUpdateListing, apiUpdateUser, apiUploadMedia } from "@/lib/api/client";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";
import { draftToListingPatch } from "@/lib/listing-edit";
import { writeListingEditSession } from "@/lib/listing-edit-session";
import { stripHallucinatedListingDefaults } from "@/lib/conversation-listing-draft";
import { importListingFromUrl as fetchListingFromPortal, ListingImportError, createImportFallbackDraft } from "@/lib/listing-url-import";
import { normalizeKnownListingCity } from "@/lib/city-resolve";
import {
  LOCATION_MISSING_AGENT_PROMPT,
  resolveDynamicListingLocation,
  resolvePublishListingCity,
  verifiedProfileCity,
} from "@/lib/listing-location-context";
import { hasListingPhoto, LISTING_PHOTO_REQUIRED_MESSAGE } from "@/lib/listing-form-validation";
import { clearAllListingDrafts } from "@/lib/listing-draft-storage";
import { clearPhotoSearchSession } from "@/lib/photo-search-session";
import { clearPendingPhotoIntent } from "@/lib/photo-intent-session";
import { isDataApiEnabled } from "@/lib/api/config";
import { defaultExpiresAt, withDefaultExpiry } from "@/lib/listing-expiry";
import { attributesToTags } from "@/lib/listing-attributes";
import { parseVideoUrl } from "@/lib/video-url";
import {
  AiSafeguardError,
  createManualFallbackDraft,
  evaluatePriceSanity,
  formatPriceForConfirm,
  isValidAiExtracted,
  logAiSafeguard,
  MANUAL_FALLBACK_TOAST,
  VISION_RECOGNITION_FAILED_MESSAGE,
  withAiTimeout,
} from "@/lib/ai-safeguards";
import { detectSellerListingIntent } from "@/lib/scoring";
import { resolveBrowseAllIntent } from "@/lib/browse-all-intent";
import { pushAgentGreeting, notifyAgentFlow, notifyListingPublishComplete, notifyAgentError } from "@/lib/vauto-agent-client";
import {
  buildPhotoClarificationMessage,
  extractVisionChoiceChips,
  shouldClarifyPhotoUpload,
} from "@/lib/vision-choice-chips";
import {
  buildPostValidationQuickReplies,
  buildPostValidationReport,
  shouldRunPostValidationReport,
} from "@/lib/listing-field-confirmation";
import type { WardrobeDraftItem } from "@/lib/wardrobe-vision";
import { wardrobeItemToDraft } from "@/lib/wardrobe-vision";
import { detectVehicleMake } from "@/lib/vehicle-keywords";
import {
  enrichVehicleListingDraft,
  looksLikeVehicleListingText,
} from "@/lib/vehicle-attribute-extract";
import {
  inferRealEstateTitle,
  isRealEstateQuery,
  NT_KEYWORD_PATTERN,
} from "@/lib/nt-keywords";
import {
  detectPropertyTypeFromText,
  detectTransactionFromText,
  defaultTransactionForType,
} from "@/lib/real-estate-catalog";
import {
  detectBrandFromText,
  detectClothingGroupFromText,
  detectSizeFromText,
  detectSubcategoryFromText,
  enrichClothingListingDraft,
  FASHION_CATEGORY_ATTR,
  formatFashionCategory,
  looksLikeClothingListing,
  readFashionCategory,
} from "@/lib/clothing-catalog";
import {
  detectConditionFromText,
  detectListingActionFromText,
  detectSkelbiuCategoryFromText,
  isGeneralListingCategory,
  looksLikeGeneralListing,
} from "@/lib/general-catalog";
import {
  defaultJobType,
  detectExperienceArea,
  detectJobGroup,
  detectLocationType,
  looksLikeJobListing,
} from "@/lib/job-catalog";
import {
  detectServiceSpecialty,
  looksLikeServiceListing,
} from "@/lib/service-catalog";
import {
  DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS,
  mergeSocialPublishAttributes,
  type ListingSocialPublishOptions,
} from "@/lib/listing-social-publish";
import { scheduleListingSocialPublish } from "@/lib/listing-social-sync";
import { listingToAdaptiveKey, evaluateListingPublishValidation } from "@/lib/adaptive-categories";
import {
  adaptiveVerticalChanged,
  detectSellerPhotoCategoryConflict,
  finalizeListingDraft,
  resolveEffectiveListingCategory,
  sanitizeAttributesForCategory,
} from "@/lib/listing-attribute-isolation";
import {
  pushPhotoCategoryMismatchGreeting,
  hasActivePhotoCategoryMismatch,
} from "@/lib/seller-photo-category-mismatch";
import {
  isBarcodeLookupEligibleCategory,
  resolveBarcodeFromAttributes,
} from "@/lib/product-intelligence/barcode-utils";
import { setPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import {
  buildConductorPublishSnapshot,
  commitConductorDraft,
  conductorSellerSubmitSource,
  conductorShouldDelegateLegacy,
  conductorWardrobeBulkSource,
  enrichListingWithConductorMeta,
  resetConductorDraft,
  resolveListingRequiresReview,
  executeConductorRoute,
  readConductorTextExecute,
  readConductorVisionExecute,
} from "@/lib/vauto-conductor";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import {
  isWeakVisionExtraction,
  RECOVERY_PROCESSING_TIMEOUT_MS,
  shouldEnterConversationalRecovery,
  VISION_CONVERSATIONAL_RECOVERY_PROMPT,
} from "@/lib/ai-conversational-recovery";
import { completeVoiceTeardown } from "@/lib/voice-teardown";
import { isUnclearTranscript } from "@/lib/voice-graceful";
import { applyProfileToListingDraft, injectProfileContactsForPublish, resolveDraftContact, validatePublishSession, hasProfileListingContact } from "@/lib/profile-listing-sync";
import { resolveSellerGalleryImages } from "@/lib/visual-pipeline-merge";
import type {
  AiExtractedListing,
  Listing,
  ListingCategory,
  SellerFlowStep,
  SellerInputMode,
} from "@/lib/types";

function attachProductBarcodeHint(
  draft: AiExtractedListing,
  sourceText: string
): AiExtractedListing {
  if (!isBarcodeLookupEligibleCategory(draft.category)) return draft;
  const barcode = resolveBarcodeFromAttributes(draft.attributes ?? {}, sourceText);
  if (!barcode) return draft;
  return {
    ...draft,
    attributes: {
      ...(draft.attributes ?? {}),
      barcode,
    },
  };
}

function hasExplicitServiceKeywords(text: string): boolean {
  return /\b(meistr|paslaug|elektrik|santechn|valym|remont|statyb|plytel|gro[žz]|kirp|transport)/i.test(
    text
  );
}

async function prepareListingImageForApi(
  src: string | null | undefined,
  listingId?: string
): Promise<string | null> {
  if (!src?.trim()) return null;
  let image = (await resolveImageForUpload(src)) ?? src.trim();
  if (image.startsWith("data:image")) {
    image = await compressDataUrl(image);
    const cloudUrl = await apiUploadMedia(image, listingId);
    if (cloudUrl) return cloudUrl;
    return image;
  }
  if (/^https?:\/\//i.test(image)) return image;
  return null;
}

export interface SellerFlowContextValue {
  sellerStep: SellerFlowStep;
  sellerInputMode: SellerInputMode;
  sellerUserPrompt: string | null;
  aiDraft: AiExtractedListing | null;
  aiManualFallback: boolean;
  sellerPreviewImage: string | null;
  /** Smart-sorted gallery from Visual AI Pipeline (v1.6.17). */
  sellerPreviewImages: string[];
  sellerVideoUrl: string;
  updateSellerMedia: (patch: {
    imageDataUrl?: string | null;
    videoUrl?: string;
  }) => void;
  startUploadFlow: () => Promise<void>;
  startVoiceFlow: () => void;
  completeVoiceRecording: (transcript: string | null) => void;
  cancelVoiceRecording: () => void;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  isPublishingListing: boolean;
  publishListing: () => void;
  publishBulkClothingListings: (drafts: AiExtractedListing[]) => Promise<void>;
  cancelSellerFlow: () => void;
  lastPublishedListing: Listing | null;
  finishPublishedFlow: () => void;
  submitSellerContent: (payload: {
    text?: string;
    imageDataUrl?: string | null;
    imageDataUrls?: string[];
    extraContext?: string;
    videoUrl?: string;
    voiceCapture?: boolean;
  }) => Promise<void>;
  /** Re-run vision on a new photo while the confirmation wizard is open. */
  reprocessConfirmationPhoto: (imageDataUrl: string) => Promise<void>;
  applyAgentListingDraft: (
    draft: AiExtractedListing,
    imageUrl?: string,
    draftSource?: import("@/lib/vauto-conductor").UnifiedDraftSource
  ) => void;
  applyAgentWardrobeBulk: (
    items: import("@/lib/wardrobe-vision").WardrobeDraftItem[],
    opts?: { imageUrl?: string; voiceAnnouncement?: string }
  ) => void;
  /** Sync wizard vision/import preview into agent-accessible bulk state (no navigation). */
  stageWardrobeBulkPreview: (
    items: import("@/lib/wardrobe-vision").WardrobeDraftItem[],
    voiceAnnouncement?: string
  ) => void;
  pendingWardrobeBulkItems: import("@/lib/wardrobe-vision").WardrobeDraftItem[] | null;
  pendingWardrobeVoice: string | null;
  importListingFromUrl: (url: string) => Promise<void>;
  startListingFromQuery: (text: string) => boolean;
  pendingSellerQuery: string | null;
  consumePendingSellerQuery: () => string | null;
  openManualListingWizard: (opts?: {
    previewImage?: string | null;
    toastMessage?: string;
    inputMode?: SellerInputMode;
  }) => void;
  startEditListingFlow: (listing: Listing) => void;
  listingSocialPublish: ListingSocialPublishOptions;
  updateListingSocialPublish: (patch: Partial<ListingSocialPublishOptions>) => void;
  revertPhotoCategoryMismatch: () => boolean;
  acceptPhotoCategoryMismatch: () => void;
  photoCategoryMismatch: { fromCategory: ListingCategory; toCategory: ListingCategory } | null;
  /** Vision timeout / weak category — agent collects clarifying text. */
  sellerVisionRecoveryActive: boolean;
  submitSellerClarification: (text: string) => Promise<boolean>;
}

const SellerFlowContext = createContext<SellerFlowContextValue | null>(null);

export function SellerFlowContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, authHydrated, openAuthModal, requireAuthForListing } = useAuth();
  const {
    listings,
    setListings,
    buyerCoords,
    setSyncError,
    showToast,
    showConfirm,
    scheduleSellerEngagementPush,
    setDetectedAdaptiveKey,
    setChameleonTheme,
    refreshListingsCatalog,
  } = useVautoBridge();
  const { trackEvent } = useUserBehavior();

  const [sellerStep, setSellerStep] = useState<SellerFlowStep>("idle");
  const [sellerInputMode, setSellerInputMode] = useState<SellerInputMode>(null);
  const [sellerUserPrompt, setSellerUserPrompt] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<AiExtractedListing | null>(null);
  const [aiManualFallback, setAiManualFallback] = useState(false);
  const [sellerPreviewImage, setSellerPreviewImage] = useState<string | null>(null);
  const [sellerPreviewImages, setSellerPreviewImages] = useState<string[]>([]);
  const [sellerVideoUrl, setSellerVideoUrl] = useState("");
  const [sellerHasVideo, setSellerHasVideo] = useState(false);
  const [pendingSellerQuery, setPendingSellerQuery] = useState<string | null>(null);
  const [lastPublishedListing, setLastPublishedListing] = useState<Listing | null>(null);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [listingSocialPublish, setListingSocialPublish] =
    useState<ListingSocialPublishOptions>(DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS);
  const [pendingWardrobeBulkItems, setPendingWardrobeBulkItems] = useState<
    WardrobeDraftItem[] | null
  >(null);
  const [pendingWardrobeVoice, setPendingWardrobeVoice] = useState<string | null>(null);
  const [photoCategoryMismatch, setPhotoCategoryMismatch] = useState<{
    fromCategory: ListingCategory;
    toCategory: ListingCategory;
  } | null>(null);
  const [sellerVisionRecoveryActive, setSellerVisionRecoveryActive] = useState(false);
  const [isPublishingListing, setIsPublishingListing] = useState(false);
  const isPublishingRef = useRef(false);
  const sellerDraftIdRef = useRef<string | null>(null);
  const recoveryImageRef = useRef<string | null>(null);
  const processingEpochRef = useRef(0);
  const categoryMismatchRollbackRef = useRef<{
    draft: AiExtractedListing;
    previewImage: string | null;
  } | null>(null);
  const categoryMismatchPendingRef = useRef<AiExtractedListing | null>(null);
  const photoReplaceSnapshotRef = useRef<{
    draft: AiExtractedListing;
    previewImage: string | null;
  } | null>(null);
  const aiDraftRef = useRef<AiExtractedListing | null>(null);
  const sellerPreviewImageRef = useRef<string | null>(null);

  useEffect(() => {
    aiDraftRef.current = aiDraft;
  }, [aiDraft]);

  useEffect(() => {
    sellerPreviewImageRef.current = sellerPreviewImage;
  }, [sellerPreviewImage]);

  const syncDraftWithProfile = useCallback(
    (draft: AiExtractedListing): AiExtractedListing =>
      isAuthenticated && hasProfileListingContact(user)
        ? injectProfileContactsForPublish(draft, user)
        : applyProfileToListingDraft(draft, user, isAuthenticated),
    [user, isAuthenticated]
  );

  const abortSellerProcessing = useCallback(() => {
    processingEpochRef.current += 1;
    void completeVoiceTeardown();
  }, []);

  const isProcessingStale = useCallback(
    (epoch: number) => epoch !== processingEpochRef.current,
    []
  );

  const updateListingSocialPublish = useCallback(
    (patch: Partial<ListingSocialPublishOptions>) => {
      setListingSocialPublish((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const resetSellerFlow = useCallback(() => {
    setSellerStep("idle");
    setSellerInputMode(null);
    setSellerUserPrompt(null);
    setAiDraft(null);
    setAiManualFallback(false);
    setSellerPreviewImage(null);
    setSellerPreviewImages([]);
    setSellerVideoUrl("");
    setSellerHasVideo(false);
    setPendingSellerQuery(null);
    setLastPublishedListing(null);
    setEditingListingId(null);
    setListingSocialPublish(DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS);
    setPendingWardrobeBulkItems(null);
    setPendingWardrobeVoice(null);
    setPhotoCategoryMismatch(null);
    categoryMismatchRollbackRef.current = null;
    categoryMismatchPendingRef.current = null;
    photoReplaceSnapshotRef.current = null;
    setSellerVisionRecoveryActive(false);
    recoveryImageRef.current = null;
    clearAllListingDrafts();
    clearPhotoSearchSession();
    clearPendingPhotoIntent();
    sellerDraftIdRef.current = null;
    resetConductorDraft();
  }, []);

  const finishPublishedFlow = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const openManualListingWizard = useCallback(
    (opts?: {
      previewImage?: string | null;
      toastMessage?: string;
      inputMode?: SellerInputMode;
    }) => {
      abortSellerProcessing();
      setAiManualFallback(true);
      setAiDraft(
        syncDraftWithProfile(
          createManualFallbackDraft({
            location: verifiedProfileCity(user.city),
            contact: user.phone,
          })
        )
      );
      if (opts?.previewImage) {
        setSellerPreviewImage(opts.previewImage);
      }
      if (opts?.inputMode) {
        setSellerInputMode(opts.inputMode);
      } else {
        setSellerInputMode((prev) => prev ?? "upload");
      }
      setSellerStep("idle");
      showToast(
        opts?.toastMessage ?? VISION_RECOGNITION_FAILED_MESSAGE,
        "info"
      );
    },
    [user.city, user.phone, showToast, abortSellerProcessing, syncDraftWithProfile]
  );

  const enterConversationalRecovery = useCallback(
    (opts: {
      previewImage?: string | null;
      inputMode?: SellerInputMode;
      partialDraft?: AiExtractedListing | null;
      reason?: string;
    }) => {
      abortSellerProcessing();
      setSellerVisionRecoveryActive(true);
      recoveryImageRef.current = opts.previewImage ?? sellerPreviewImageRef.current;
      setAiManualFallback(false);

      const baseDraft = opts.partialDraft
        ? syncDraftWithProfile(
            finalizeListingDraft(opts.partialDraft, opts.partialDraft.category, opts.partialDraft.attributes ?? {})
          )
        : syncDraftWithProfile(
            createManualFallbackDraft({
              location: user.city,
              contact: user.phone,
            })
          );

      setAiDraft(baseDraft);
      if (recoveryImageRef.current) {
        setSellerPreviewImage(recoveryImageRef.current);
      }
      setSellerInputMode(opts.inputMode ?? "upload");
      setSellerUserPrompt(null);
      setSellerStep("idle");
      setChameleonTheme("flux");

      pushAgentGreeting(VISION_CONVERSATIONAL_RECOVERY_PROMPT, {
        replaceThread: true,
      });

      showToast("Asistentas padės užbaigti — parašykite kelis žodžius.", "info");
      logAiSafeguard("fallback_triggered", {
        mode: opts.inputMode ?? "upload",
        reason: opts.reason ?? "conversational_recovery",
        conversational: true,
      });
    },
    [user.city, user.phone, showToast, abortSellerProcessing, syncDraftWithProfile, setChameleonTheme]
  );

  const runAiProcessing = useCallback(
    async (
      mode: SellerInputMode,
      opts?: {
        transcript?: string;
        previewImage?: string | null;
        previewImages?: string[];
        extraContext?: string;
        videoUrl?: string;
        recoveryRetry?: boolean;
      }
    ) => {
      const epoch = processingEpochRef.current;
      const started = performance.now();
      setSellerStep("processing");
      setAiManualFallback(false);

      const promptText =
        opts?.transcript?.trim() ||
        (mode === "upload" ? "Įkelta nuotrauka — analizuoju…" : null);
      if (promptText) setSellerUserPrompt(promptText);

      logAiSafeguard("processing_start", { mode, hasImage: Boolean(opts?.previewImage) });

      let conductorVision = null as ReturnType<typeof readConductorVisionExecute>;
      let conductorText = null as ReturnType<typeof readConductorTextExecute>;
      const shouldRouteSeller =
        (mode === "upload" || mode === "combined") &&
        Boolean(opts?.previewImage || opts?.previewImages?.length);
      const shouldRouteText =
        (mode === "text" || mode === "voice") && Boolean(opts?.transcript?.trim());
      if (shouldRouteSeller || shouldRouteText) {
        const route = await executeConductorRoute({
          ...conductorSellerSubmitSource("SellerFlowContext.runAiProcessing"),
          payload: {
            mode,
            imageDataUrl: opts?.previewImage,
            imageDataUrls: opts?.previewImages,
            transcript: opts?.transcript,
            extraContext: opts?.extraContext,
            userCity: user.city,
            contact: user.phone,
            recoveryRetry: opts?.recoveryRetry,
          },
        });
        if (!conductorShouldDelegateLegacy(route)) {
          conductorVision = readConductorVisionExecute(route);
          conductorText = readConductorTextExecute(route);
        }
      }

      const enterManualFallback = (reason: string, error?: unknown) => {
        if (isProcessingStale(epoch)) return;
        if (shouldEnterConversationalRecovery(reason)) {
          enterConversationalRecovery({
            previewImage: opts?.previewImage ?? sellerPreviewImage,
            inputMode: mode ?? undefined,
            reason,
          });
          logAiSafeguard("fallback_triggered", {
            mode,
            reason,
            elapsedMs: Math.round(performance.now() - started),
            error: error instanceof Error ? error.message : String(error ?? ""),
            conversational: true,
          });
          return;
        }
        if (reason === "timeout") {
          notifyAgentError("ai_timeout", "AI analizė užtruko per ilgai");
        } else if (reason === "invalid_extraction") {
          notifyAgentError("ai_invalid", "Nepavyko automatiškai atpažinti turinio");
        }
        const fallbackToast =
          mode === "upload"
            ? VISION_RECOGNITION_FAILED_MESSAGE
            : MANUAL_FALLBACK_TOAST;
        openManualListingWizard({
          previewImage: opts?.previewImage ?? sellerPreviewImage,
          toastMessage: fallbackToast,
          inputMode: mode ?? undefined,
        });
        logAiSafeguard("fallback_triggered", {
          mode,
          reason,
          elapsedMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error ?? ""),
        });
      };

      try {
        let locationHint: string;
        let extracted: Awaited<ReturnType<typeof extractFromImage>>;

        if (conductorVision) {
          if (isProcessingStale(epoch)) return;
          locationHint = conductorVision.locationHint;
          extracted = conductorVision.extracted;
        } else if (conductorText) {
          if (isProcessingStale(epoch)) return;
          locationHint = conductorText.locationHint;
          extracted = conductorText.extracted;
        } else {
          locationHint = await resolveDynamicListingLocation({
            profileCity: user.city,
            requestGeo: true,
          });

          const extractPromise = (async () => {
            const ctx = {
              imageDataUrl: opts?.previewImage,
              imageDataUrls: opts?.previewImages,
              transcript: opts?.transcript,
              extraContext: opts?.extraContext,
              userCity: locationHint,
              contact: user.phone,
            };

            if (mode === "combined") return extractCombined(ctx);
            if (mode === "upload") return extractFromImage(ctx);
            if (mode === "text" || mode === "voice") return extractFromText(ctx);
            return extractFromText(ctx);
          })();

          const timeoutMs = opts?.recoveryRetry
            ? RECOVERY_PROCESSING_TIMEOUT_MS
            : undefined;
          extracted = await withAiTimeout(
            extractPromise,
            timeoutMs,
            `extract_${mode ?? "unknown"}`
          );
        }

        if (isProcessingStale(epoch)) return;

        if (!isValidAiExtracted(extracted)) {
          enterManualFallback("invalid_extraction");
          return;
        }

        let next = extracted;
        if (
          isWeakVisionExtraction(next) &&
          (mode === "upload" || mode === "combined") &&
          !opts?.recoveryRetry
        ) {
          enterConversationalRecovery({
            previewImage: opts?.previewImage ?? sellerPreviewImage,
            inputMode: mode,
            partialDraft: next,
            reason: "weak_vision",
          });
          return;
        }
        if (!normalizeKnownListingCity(next.location) && locationHint) {
          next = { ...next, location: locationHint };
        }

        const sourceBlob = [
          next.title,
          next.description,
          opts?.transcript,
          opts?.extraContext,
        ]
          .filter(Boolean)
          .join(" ");

        const textForHeuristics = sourceBlob || next.title || "";

        if (
          next.category === "services" &&
          (next.confidence ?? 0) < 0.5 &&
          !hasExplicitServiceKeywords(textForHeuristics) &&
          (mode === "upload" || mode === "combined")
        ) {
          enterManualFallback("unclear_visual_service");
          return;
        }

        const detectedProperty = detectPropertyTypeFromText(textForHeuristics);
        const looksLikeRealEstate =
          next.category === "real_estate" ||
          isRealEstateQuery(textForHeuristics) ||
          Boolean(detectedProperty) ||
          Boolean(next.attributes?.propertyType) ||
          NT_KEYWORD_PATTERN.test(textForHeuristics);

        const looksLikeVehicle =
          !looksLikeRealEstate &&
          (next.category === "vehicles" ||
            looksLikeVehicleListingText(textForHeuristics) ||
            Boolean(next.attributes?.make) ||
            Boolean(detectVehicleMake(next.title ?? "")));

        const visionSaysUniversal =
          listingToAdaptiveKey(next.category) === "universal" && next.category !== "vehicles";
        const photoReplace =
          mode === "upload" && Boolean(aiDraftRef.current);
        const previousDraftCategory = aiDraftRef.current?.category ?? null;
        const visionSkelbiu = String(next.attributes?.skelbiuCategory ?? "").toLowerCase();
        const visionImpliesElectronics =
          next.category === "electronics" ||
          /elektron|telefon|mobil|iphone|android|samsung/.test(visionSkelbiu) ||
          /telefon|iphone|samsung|mobilus/i.test(
            `${next.title ?? ""} ${next.description ?? ""}`
          );
        /** Vision trumps vehicle heuristics when user replaces photo in auto flow. */
        const visionRejectsVehicleDraft =
          photoReplace &&
          previousDraftCategory === "vehicles" &&
          (next.category !== "vehicles" || visionImpliesElectronics);
        const allowVehicleHeuristic =
          looksLikeVehicle &&
          !visionRejectsVehicleDraft &&
          !(photoReplace && visionSaysUniversal);

        if (looksLikeRealEstate) {
          const attrs = { ...(next.attributes ?? {}) };
          const propertyType =
            (attrs.propertyType as string) || detectedProperty || "butas";
          if (!attrs.propertyType) attrs.propertyType = propertyType;
          if (!attrs.transactionType) {
            attrs.transactionType =
              detectTransactionFromText(textForHeuristics) ??
              defaultTransactionForType(propertyType);
          }
          const roomsMatch = textForHeuristics.match(/(\d+)\s*kamb/i);
          if (!attrs.rooms && roomsMatch) attrs.rooms = roomsMatch[1];
          const areaMatch = textForHeuristics.match(/(\d+(?:[.,]\d+)?)\s*(?:kv\.?m|m²|m2)/i);
          if (!attrs.area && areaMatch) attrs.area = areaMatch[1].replace(",", ".");
          if (!attrs.sellerRole) attrs.sellerRole = "Privatus asmuo";
          const smartTitle =
            next.title &&
            !/universalus daiktas|prekė nuotraukoje|skelbimas/i.test(next.title)
              ? next.title
              : inferRealEstateTitle(textForHeuristics);
          next = {
            ...next,
            category: "real_estate",
            title: smartTitle,
            attributes: attrs,
          };
        } else if (allowVehicleHeuristic) {
          next = enrichVehicleListingDraft(next, [textForHeuristics]);
        } else {
          const title = next.title ?? textForHeuristics;
          if (looksLikeClothingListing(textForHeuristics, next.category)) {
            const attrs = { ...(next.attributes ?? {}) };
            const group = detectClothingGroupFromText(textForHeuristics) ?? "Moterims";
            const sub = detectSubcategoryFromText(textForHeuristics, group) ?? "Kita";
            if (!readFashionCategory(attrs)) {
              attrs[FASHION_CATEGORY_ATTR] = formatFashionCategory(group, sub);
            }
            if (!attrs.brand) {
              const brand = detectBrandFromText(textForHeuristics);
              if (brand) attrs.brand = brand;
            }
            if (!attrs.size) {
              const size = detectSizeFromText(textForHeuristics);
              if (size) attrs.size = size;
            }
            if (!attrs.condition) attrs.condition = "Gera";
            next = { ...next, category: "clothing", attributes: attrs };
          } else if (
            (hasExplicitServiceKeywords(textForHeuristics) ||
              (next.category === "services" && (next.confidence ?? 0) >= 0.55)) &&
            looksLikeServiceListing(textForHeuristics, next.category)
          ) {
            const attrs = { ...(next.attributes ?? {}) };
            if (!attrs.serviceSpecialty) {
              const specialty = detectServiceSpecialty(title);
              if (specialty) attrs.serviceSpecialty = specialty;
            }
            if (!attrs.serviceRadius) attrs.serviceRadius = "25 km";
            next = { ...next, category: "services", attributes: attrs };
          } else if (looksLikeJobListing(title, next.category)) {
            const attrs = { ...(next.attributes ?? {}) };
            if (!attrs.jobType) attrs.jobType = defaultJobType(title);
            if (!attrs.jobTitle && next.title) attrs.jobTitle = next.title;
            if (!attrs.cvEmail && user.email) attrs.cvEmail = user.email;
            if (!attrs.experienceArea) {
              const area = detectExperienceArea(title);
              if (area) attrs.experienceArea = area;
            }
            if (!attrs.jobGroup) attrs.jobGroup = detectJobGroup(title);
            if (!attrs.locationType) attrs.locationType = detectLocationType(title);
            if (!attrs.workTimeFull) attrs.workTimeFull = "true";
            if (!attrs.salaryPeriod) attrs.salaryPeriod = "€/mėn.";
            if (!attrs.adLanguage) attrs.adLanguage = "LT";
            next = { ...next, category: "jobs", attributes: attrs };
          } else if (
            looksLikeGeneralListing(title, next.category) &&
            !["services", "jobs", "vehicles", "real_estate", "clothing"].includes(next.category)
          ) {
            const attrs = { ...(next.attributes ?? {}) };
            if (!attrs.listingAction) {
              attrs.listingAction = detectListingActionFromText(title);
            }
            if (!attrs.sellerType) attrs.sellerType = "Privatus asmuo";
            const skCat = detectSkelbiuCategoryFromText(title);
            if (skCat && !attrs.skelbiuCategory) attrs.skelbiuCategory = skCat;
            const cond = detectConditionFromText(title);
            if (cond && !attrs.condition) attrs.condition = cond;
            if (!isGeneralListingCategory(next.category)) {
              next = { ...next, category: "other", attributes: attrs };
            } else {
              next = { ...next, attributes: attrs };
            }
          }
        }

        const geo = geocodeLocation(next.location);
        next = {
          ...next,
          attributes: {
            ...(next.attributes ?? {}),
            _geoLat: String(geo.lat),
            _geoLng: String(geo.lng),
          },
        };

        if (opts?.videoUrl) {
          setSellerVideoUrl(opts.videoUrl);
          const vid = parseVideoUrl(opts.videoUrl);
          if (vid.thumbnail && !opts.previewImage) {
            setSellerPreviewImage(vid.thumbnail);
          }
          setSellerHasVideo(vid.hasVideo);
        }

        if (isProcessingStale(epoch)) return;

        const galleryImages = resolveSellerGalleryImages(
          { orderedImageUrls: next.orderedImageUrls },
          opts?.previewImages?.length
            ? opts.previewImages
            : opts?.previewImage
              ? [opts.previewImage]
              : []
        );
        if (galleryImages.length) {
          setSellerPreviewImages(galleryImages);
          setSellerPreviewImage(galleryImages[0] ?? null);
        }

        const previousDraft = aiDraftRef.current;
        const previousCategory = previousDraft?.category ?? null;
        const previousAttributes = previousDraft?.attributes ?? null;
        const { draft: conductorMerged } = commitConductorDraft(
          next,
          "seller",
          mode === "upload" || mode === "combined" ? previousDraft : null
        );
        const withBarcode = attachProductBarcodeHint(
          conductorMerged as AiExtractedListing,
          sourceBlob
        );
        const finalized = finalizeListingDraft(
          withBarcode,
          previousCategory,
          previousAttributes
        );

        const hasPhotoCategoryMismatch =
          Boolean(previousDraft) &&
          mode === "upload" &&
          detectSellerPhotoCategoryConflict(
            previousCategory,
            previousAttributes,
            finalized
          );

        if (hasPhotoCategoryMismatch && previousDraft && previousCategory) {
          const rollbackSnap =
            photoReplaceSnapshotRef.current ?? {
              draft: finalizeListingDraft(
                previousDraft,
                previousCategory,
                previousAttributes
              ),
              previewImage: sellerPreviewImageRef.current,
            };
          categoryMismatchRollbackRef.current = rollbackSnap;
          categoryMismatchPendingRef.current = finalized;
          setPhotoCategoryMismatch({
            fromCategory: previousCategory,
            toCategory: finalized.category,
          });
          setSellerUserPrompt(null);
          pushPhotoCategoryMismatchGreeting(previousCategory, finalized.category);
          trackEvent("seller_photo_category_mismatch", {
            fromCategory: previousCategory,
            toCategory: finalized.category,
          });
          setAiDraft(rollbackSnap.draft);
        } else {
          const needsClarification =
            shouldClarifyPhotoUpload(next) &&
            (mode === "upload" || mode === "combined");

          if (needsClarification) {
            pushAgentGreeting(buildPhotoClarificationMessage(next), {
              quickReplies: extractVisionChoiceChips(next, "sell"),
            });
          } else if (
            shouldRunPostValidationReport(next, false) &&
            (mode === "upload" || mode === "combined" || mode === "text")
          ) {
            pushAgentGreeting(buildPostValidationReport(next), {
              quickReplies: buildPostValidationQuickReplies(),
            });
          }

          setPhotoCategoryMismatch(null);
          categoryMismatchPendingRef.current = null;
          photoReplaceSnapshotRef.current = null;
          setSellerUserPrompt(opts?.transcript?.trim() || null);
          const sourceText =
            opts?.transcript?.trim() ||
            opts?.extraContext?.trim() ||
            "";
          const cleaned = stripHallucinatedListingDefaults(
            syncDraftWithProfile(finalized),
            sourceText
          );
          setAiDraft(cleaned);
        }

        setSellerVisionRecoveryActive(false);
        recoveryImageRef.current = null;

        setSellerStep("idle");

        if (
          finalized.conversationalHints?.hasVisibleDefects &&
          finalized.conversationalHints.assistantPrompt?.trim()
        ) {
          pushAgentGreeting(finalized.conversationalHints.assistantPrompt.trim(), {
            quickReplies: ["Taip, įtrauk", "Ne, praleisti"],
          });
        }

        if (next.requiresReview && next.reviewNotice?.trim()) {
          showToast(next.reviewNotice.trim(), "info");
        }

        logAiSafeguard("processing_success", {
          mode,
          elapsedMs: Math.round(performance.now() - started),
          category: finalized.category,
          confidence: finalized.confidence,
        });
      } catch (error) {
        if (isProcessingStale(epoch)) return;
        if (error instanceof AiSafeguardError) {
          enterManualFallback(error.code, error);
          return;
        }
        enterManualFallback("unexpected_error", error);
      }
    },
    [user.city, user.phone, user.email, openManualListingWizard, sellerPreviewImage, isProcessingStale, showToast, trackEvent, syncDraftWithProfile, enterConversationalRecovery]
  );

  const submitSellerClarification = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      setSellerVisionRecoveryActive(false);
      const image = recoveryImageRef.current ?? sellerPreviewImageRef.current;
      recoveryImageRef.current = image;

      if (resolveBrowseAllIntent(trimmed)) return false;

      if (looksLikeVehicleListingText(trimmed) || detectSellerListingIntent(trimmed)) {
        setSellerStep("processing");
        let draft = syncDraftWithProfile(
          createManualFallbackDraft({
            location: verifiedProfileCity(user.city),
            contact: user.phone,
          })
        );
        draft = enrichVehicleListingDraft(
          { ...draft, description: trimmed, title: draft.title || trimmed.slice(0, 96) },
          [trimmed]
        );
        draft = attachProductBarcodeHint(draft, trimmed);
        const finalized = syncDraftWithProfile(
          finalizeListingDraft(draft, null, draft.attributes ?? {})
        );
        if (image) setSellerPreviewImage(image);
        setAiManualFallback(false);
        setAiDraft(finalized);
        setSellerInputMode("text");
        setSellerUserPrompt(trimmed);
        setSellerStep("idle");
        setChameleonTheme(finalized.category === "clothing" ? "wardrobe" : "flux");
        pushAgentGreeting(
          "Puiku — tęskime pokalbiu. Ką dar norėtumėte patikslinti prieš publikuojant?",
          { replaceThread: false }
        );
        return true;
      }

      await runAiProcessing("combined", {
        transcript: trimmed,
        previewImage: image,
        extraContext: trimmed,
        recoveryRetry: true,
      });
      return true;
    },
    [user.city, user.phone, syncDraftWithProfile, runAiProcessing, setChameleonTheme]
  );

  const submitSellerContent = useCallback(
    async (payload: {
      text?: string;
      imageDataUrl?: string | null;
      imageDataUrls?: string[];
      extraContext?: string;
      videoUrl?: string;
      voiceCapture?: boolean;
    }) => {
      if (!requireAuthForListing("/add")) return;

      setPhotoCategoryMismatch(null);
      categoryMismatchRollbackRef.current = null;
      categoryMismatchPendingRef.current = null;
      photoReplaceSnapshotRef.current = null;

      const primaryImage =
        payload.imageDataUrl ??
        payload.imageDataUrls?.[0] ??
        parseVideoUrl(payload.videoUrl ?? "").thumbnail;

      if (primaryImage) {
        const priorDraft = aiDraftRef.current;
        if (priorDraft) {
          photoReplaceSnapshotRef.current = {
            draft: finalizeListingDraft(
              priorDraft,
              priorDraft.category,
              priorDraft.attributes ?? {}
            ),
            previewImage: sellerPreviewImageRef.current,
          };
        }
        setSellerPreviewImage(primaryImage);
      }
      if (payload.videoUrl) {
        setSellerVideoUrl(payload.videoUrl);
        const vid = parseVideoUrl(payload.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (vid.thumbnail && !primaryImage) {
          setSellerPreviewImage(vid.thumbnail);
        }
      }

      const hasImages = Boolean(primaryImage || payload.imageDataUrls?.length);

      const mode: SellerInputMode = payload.voiceCapture
        ? hasImages && payload.text
          ? "combined"
          : hasImages
            ? "upload"
            : "voice"
        : hasImages && payload.text
          ? "combined"
          : hasImages
            ? "upload"
            : "text";

      setSellerInputMode(mode);
      if (payload.text?.trim()) setSellerUserPrompt(payload.text.trim());
      await runAiProcessing(mode, {
        transcript: payload.text,
        previewImage: primaryImage,
        previewImages: payload.imageDataUrls,
        extraContext: payload.extraContext,
        videoUrl: payload.videoUrl,
      });
    },
    [runAiProcessing, requireAuthForListing]
  );

  const reprocessConfirmationPhoto = useCallback(
    async (imageDataUrl: string) => {
      if (!requireAuthForListing("/add")) return;
      if (!imageDataUrl.trim()) return;
      const priorDraft = aiDraftRef.current;
      if (priorDraft) {
        photoReplaceSnapshotRef.current = {
          draft: finalizeListingDraft(
            priorDraft,
            priorDraft.category,
            priorDraft.attributes ?? {}
          ),
          previewImage: sellerPreviewImageRef.current,
        };
      }
      setSellerPreviewImage(imageDataUrl);
      setSellerInputMode("upload");
      setSellerUserPrompt("Įkelta nuotrauka — analizuoju…");
      await runAiProcessing("upload", { previewImage: imageDataUrl });
    },
    [requireAuthForListing, runAiProcessing]
  );

  const applyAgentListingDraft = useCallback(
    (
      draft: AiExtractedListing,
      imageUrl?: string,
      draftSource: import("@/lib/vauto-conductor").UnifiedDraftSource = "agent"
    ) => {
      if (!requireAuthForListing("/add")) return;
      void executeConductorRoute({
        ...conductorSellerSubmitSource("SellerFlowContext.applyAgentListingDraft"),
        payload: { category: draft.category },
      });
      setPhotoCategoryMismatch(null);
      categoryMismatchRollbackRef.current = null;
      categoryMismatchPendingRef.current = null;
      photoReplaceSnapshotRef.current = null;
      setAiManualFallback(false);
      const previousDraft = aiDraftRef.current;
      const { draft: merged } = commitConductorDraft(draft, draftSource, previousDraft);
      const mergedDraft = { ...draft, ...merged } as AiExtractedListing;
      const sourceText = [mergedDraft.title, mergedDraft.description].filter(Boolean).join(" ");
      let enriched = enrichVehicleListingDraft(mergedDraft, [sourceText]);
      enriched = enrichClothingListingDraft(enriched, sourceText);
      const previousCategory = previousDraft?.category ?? null;
      const previousAttributes = previousDraft?.attributes ?? null;
      setAiDraft(
        syncDraftWithProfile(
          ensureClientDraftId(
            finalizeListingDraft(enriched, previousCategory, previousAttributes)
          )
        )
      );
      setSellerInputMode("text");
      setSellerUserPrompt(enriched.description ?? enriched.title);
      if (imageUrl) setSellerPreviewImage(imageUrl);
      setChameleonTheme(enriched.category === "clothing" ? "wardrobe" : "flux");
      setSellerStep("idle");
      const detectedBarcode = resolveBarcodeFromAttributes(
        enriched.attributes ?? {},
        sourceText
      );
      if (detectedBarcode && isBarcodeLookupEligibleCategory(enriched.category)) {
        setPendingBarcodeOffer(detectedBarcode);
      }
      const vehicleAttrs = enriched.attributes;
      const prefilled =
        enriched.category === "vehicles" &&
        vehicleAttrs?.make &&
        vehicleAttrs?.model &&
        vehicleAttrs?.year;
      if (prefilled) {
        showToast(
          `AI atpažino ${vehicleAttrs.make} ${vehicleAttrs.model} ${vehicleAttrs.year} — tęskime pokalbį.`,
          "success"
        );
      }
      if (imageUrl) {
        notifyAgentFlow({
          kind: "listing_media_analyzed",
          objectLabel: enriched.title || enriched.description?.slice(0, 48) || "",
          category: enriched.category,
        });
      }
    },
    [requireAuthForListing, setChameleonTheme, showToast, syncDraftWithProfile]
  );

  const applyAgentWardrobeBulk = useCallback(
    (
      items: WardrobeDraftItem[],
      opts?: { imageUrl?: string; voiceAnnouncement?: string }
    ) => {
      if (!items.length) return;
      if (!requireAuthForListing("/add")) return;
      void executeConductorRoute({
        ...conductorWardrobeBulkSource("SellerFlowContext.applyAgentWardrobeBulk"),
        payload: { itemCount: items.length },
      });
      setAiManualFallback(false);
      setPendingWardrobeBulkItems(items.length > 1 ? items : null);
      setPendingWardrobeVoice(opts?.voiceAnnouncement?.trim() || null);
      const firstDraft = wardrobeItemToDraft(
        items[0]!,
        user.phone,
        verifiedProfileCity(user.city)
      );
      const { draft: merged } = commitConductorDraft(firstDraft, "agent", null);
      const mergedDraft = { ...firstDraft, ...merged } as AiExtractedListing;
      setAiDraft(syncDraftWithProfile(mergedDraft));
      setSellerInputMode("upload");
      setSellerUserPrompt(opts?.voiceAnnouncement ?? mergedDraft.title);
      if (opts?.imageUrl) setSellerPreviewImage(opts.imageUrl);
      setChameleonTheme("wardrobe");
      setSellerStep("idle");
      showToast(
        opts?.voiceAnnouncement ??
          (items.length > 1
            ? `AI aptiko ${items.length} drabužius — tęskime pokalbį.`
            : "AI paruošė drabužio skelbimą — tęskime pokalbį."),
        "success"
      );
    },
    [requireAuthForListing, setChameleonTheme, showToast, user.phone, user.city, syncDraftWithProfile]
  );

  const stageWardrobeBulkPreview = useCallback(
    (items: WardrobeDraftItem[], voiceAnnouncement?: string) => {
      if (!items.length) return;
      setPendingWardrobeBulkItems(items.length > 1 ? items : null);
      if (voiceAnnouncement?.trim()) {
        setPendingWardrobeVoice(voiceAnnouncement.trim());
      }
    },
    []
  );

  const importListingFromUrl = useCallback(
    async (url: string) => {
      if (!requireAuthForListing("/add")) return;
      setSellerStep("processing");
      setAiManualFallback(false);
      try {
        const draft = await fetchListingFromPortal(url, {
          userCity: verifiedProfileCity(user.city),
          contact: user.phone,
        });
        applyAgentListingDraft(draft);
        showToast(
          "Skelbimas importuotas — peržiūrėkite ir publikuokite visoje Lietuvoje",
          "success"
        );
      } catch (e) {
        const fallback =
          e instanceof ListingImportError
            ? e.fallbackDraft
            : createImportFallbackDraft(url, {
                userCity: verifiedProfileCity(user.city),
                contact: user.phone,
              });
        const msg = e instanceof Error ? e.message : "Nepavyko importuoti skelbimo";
        if (fallback) {
          setAiManualFallback(true);
          const enriched = enrichVehicleListingDraft(fallback, [
            fallback.title,
            fallback.description ?? "",
          ]);
          setAiDraft(syncDraftWithProfile(enriched));
          setSellerInputMode("text");
          setSellerUserPrompt(enriched.description ?? "");
          setChameleonTheme(enriched.category === "clothing" ? "wardrobe" : "flux");
          setSellerStep("idle");
        } else {
          setSellerStep("idle");
        }
        showToast(`${msg} Užpildykite laukus ranka.`, "error");
      }
    },
    [
      applyAgentListingDraft,
      requireAuthForListing,
      showToast,
      setChameleonTheme,
      syncDraftWithProfile,
      user.city,
      user.phone,
    ]
  );

  const startListingFromQuery = useCallback(
    () => {
      return false;
    },
    []
  );

  const consumePendingSellerQuery = useCallback(() => {
    const q = pendingSellerQuery;
    if (q) setPendingSellerQuery(null);
    return q;
  }, [pendingSellerQuery]);

  const completeVoiceRecording = useCallback(
    (transcript: string | null) => {
      const cleaned = transcript?.trim() ?? "";
      if (isUnclearTranscript(cleaned)) {
        showToast("Nepavyko atpažinti teksto — bandykite įvesti ranka.", "info");
        setSellerStep("idle");
        return;
      }
      void runAiProcessing("text", { transcript: cleaned });
    },
    [runAiProcessing, showToast]
  );

  const cancelVoiceRecording = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const updateAiDraft = useCallback((patch: Partial<AiExtractedListing>) => {
    setAiDraft((prev) => {
      if (!prev) return prev;

      const nextCategory = patch.category ?? prev.category;
      const verticalChanged =
        patch.category !== undefined &&
        adaptiveVerticalChanged(prev.category, nextCategory);

      const prevAttrs = prev.attributes ?? {};
      const baseAttrs = verticalChanged ? {} : prevAttrs;
      const hasAttrPatch = patch.attributes !== undefined;

      const attributes = hasAttrPatch || verticalChanged
        ? sanitizeAttributesForCategory(
            nextCategory,
            baseAttrs,
            hasAttrPatch ? patch.attributes : {}
          )
        : prevAttrs;

      return syncDraftWithProfile({
        ...prev,
        ...patch,
        category: nextCategory,
        attributes,
      });
    });
  }, [syncDraftWithProfile]);

  const revertPhotoCategoryMismatch = useCallback(() => {
    const snap = categoryMismatchRollbackRef.current;
    if (!snap) return false;
    setAiDraft(snap.draft);
    setSellerPreviewImage(snap.previewImage);
    setSellerStep("idle");
    setSellerUserPrompt(null);
    setPhotoCategoryMismatch(null);
    categoryMismatchRollbackRef.current = null;
    categoryMismatchPendingRef.current = null;
    photoReplaceSnapshotRef.current = null;
    showToast("Atstatytas automobilių skelbimo juodraštis.", "info");
    return true;
  }, [showToast]);

  const acceptPhotoCategoryMismatch = useCallback(() => {
    const pending = categoryMismatchPendingRef.current;
    if (pending) {
      setAiDraft(syncDraftWithProfile(pending));
    }
    categoryMismatchRollbackRef.current = null;
    categoryMismatchPendingRef.current = null;
    photoReplaceSnapshotRef.current = null;
    setPhotoCategoryMismatch(null);
    setSellerUserPrompt(null);
    setSellerStep("idle");
    showToast("Kategorija pakeista į elektroniką.", "info");
  }, [showToast, syncDraftWithProfile]);

  const publishListing = useCallback(async () => {
    if (isPublishingRef.current) return;
    if (!aiDraft) {
      showToast("Klaida: nėra skelbimo duomenų. Bandykite iš naujo.", "error");
      return;
    }
    if (hasActivePhotoCategoryMismatch(photoCategoryMismatch)) {
      showToast(
        "Pirmiausia pasirinkite: grįžti į automobilių srautą arba keisti kategoriją į elektroniką.",
        "error"
      );
      return;
    }
    if (!authHydrated) {
      showToast("Palaukite — kraunama paskyra…", "info");
      return;
    }
    const sessionCheck = validatePublishSession(isAuthenticated, user);
    if (!sessionCheck.ok) {
      if (!isAuthenticated) {
        openAuthModal("/");
      }
      showToast(sessionCheck.message, "error");
      return;
    }
    if (!hasListingPhoto(sellerPreviewImage) && !editingListingId) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }

    const profileDraft = injectProfileContactsForPublish(aiDraft, user);
    if (profileDraft !== aiDraft) {
      setAiDraft(profileDraft);
    }
    const publishContact = resolveDraftContact(profileDraft, user);

    const conductorPublish = buildConductorPublishSnapshot(profileDraft);
    if (conductorPublish.sources.length) {
      trackEvent("conductor_publish", {
        sources: conductorPublish.sources.join(","),
        category: profileDraft.category,
        mergedAt: conductorPublish.mergedAt,
      });
    }

    const validation = evaluateListingPublishValidation(
      profileDraft.category,
      {
        title: profileDraft.title,
        price: profileDraft.price,
        description: profileDraft.description,
        contact: publishContact,
        attributes: profileDraft.attributes,
      },
      {
        hasPhoto: Boolean(sellerPreviewImage),
        conversational: true,
        profileContact: publishContact,
      }
    );

    if (!validation.canPublish) {
      showToast(validation.blockMessage, "error");
      return;
    }

    const priceSanity =
      profileDraft.price > 0
        ? evaluatePriceSanity(profileDraft.category, profileDraft.price)
        : { suspicious: false as const };
    if (priceSanity.suspicious) {
      const priceDisplay = formatPriceForConfirm(profileDraft.price, profileDraft.priceLabel);
      const confirmed = await showConfirm({
        title: "Patikrinkite kainą",
        message: `AI pastebėjo, kad kaina gali būti klaidinga. Ar tikrai norite skelbti su kaina: ${priceDisplay}?`,
        confirmLabel: "Taip, skelbti",
        cancelLabel: "Grįžti",
      });
      if (!confirmed) return;
    }

    const mod = moderateListing(profileDraft);
    if (!mod.allowed) {
      showToast(mod.reason ?? "Skelbimas atmestas moderacijos.", "error");
      return;
    }

    if (!editingListingId && !hasListingPhoto(sellerPreviewImage)) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }

    isPublishingRef.current = true;
    setIsPublishingListing(true);

    try {
    const clientDraftId =
      sellerDraftIdRef.current ??
      readClientDraftId(profileDraft.attributes) ??
      (() => {
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `draft-${Date.now()}`;
        sellerDraftIdRef.current = id;
        return id;
      })();
    sellerDraftIdRef.current = clientDraftId;

    const draftWithClientId = ensureClientDraftId({
      ...profileDraft,
      contact: publishContact,
      attributes: { ...(profileDraft.attributes ?? {}), clientDraftId },
    });
    if (readClientDraftId(profileDraft.attributes) !== clientDraftId) {
      setAiDraft(draftWithClientId);
    }

    if (
      clientDraftId &&
      listings.some(
        (l) =>
          l.sellerId === user.id &&
          readClientDraftId(l.attributes) === clientDraftId
      )
    ) {
      showToast("Šis skelbimas jau publikuotas — atnaujinkite esamą.", "info");
      return;
    }

    if (editingListingId) {
      const existing = listings.find((l) => l.id === editingListingId);
      if (!existing || existing.sellerId !== user.id) {
        showToast("Skelbimas nerastas arba neturite teisių.", "error");
        return;
      }
      const patch = draftToListingPatch({
        ...profileDraft,
        contact: publishContact,
      });
      const imageSource = sellerPreviewImage ?? existing.images[0] ?? null;
      const listingImage = await prepareListingImageForApi(imageSource, editingListingId);
      if (!listingImage && !hasListingPhoto(existing.images[0])) {
        showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
        return;
      }
      const updated: Listing = enrichListingCoords({
        ...existing,
        ...patch,
        contact: publishContact,
        attributes: mergeSocialPublishAttributes(
          { ...(existing.attributes ?? {}), ...(patch.attributes ?? profileDraft.attributes) },
          listingSocialPublish
        ),
        images: listingImage
          ? [listingImage, ...existing.images.slice(1)]
          : existing.images,
        slug: generateListingSlug(patch.title ?? existing.title, patch.location ?? existing.location),
        hasVideo: sellerHasVideo,
      });
      setListings((prev) =>
        prev.map((l) => (l.id === editingListingId ? updated : l))
      );
      if (isDataApiEnabled()) {
        const res = await apiUpdateListing(editingListingId, user.id, {
          ...patch,
          contact: publishContact,
          images: updated.images,
        });
        if (!res.ok) {
          setSyncError(`Nepavyko atnaujinti: ${res.error}`);
          showToast(`Nepavyko atnaujinti: ${res.error}`, "error");
          return;
        }
      }
      showToast("Skelbimas atnaujintas!", "success");
      resetSellerFlow();
      return;
    }

    if (isDuplicateListing(draftWithClientId.title, user.id, listings)) {
      showToast(
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą.",
        "error"
      );
      return;
    }

    let distKm = 0.5;
    const coordsPromise = buyerCoords
      ? Promise.resolve(buyerCoords)
      : Promise.race([
          getUserCoords({ requestPermission: true }),
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2000)),
        ]);

    const vin =
      typeof profileDraft.attributes?.vin === "string" ? profileDraft.attributes.vin : undefined;
    const vinOk =
      profileDraft.isVinVerified === true ||
      (vin ? verifyVin(vin) && profileDraft.isVinVerified !== false : false);

    const createdAt = new Date().toISOString();
    const listingId = clientDraftId
      ? listingIdFromClientDraftId(clientDraftId)
      : `l-${Date.now()}`;

    const [listingImage, extraImages, coords] = await Promise.all([
      prepareListingImageForApi(sellerPreviewImage, listingId),
      sellerPreviewImages.length > 1
        ? Promise.all(
            sellerPreviewImages.slice(1).map((src) => prepareListingImageForApi(src, listingId))
          )
        : Promise.resolve([] as (string | null)[]),
      coordsPromise,
    ]);
    const galleryImages = [
      listingImage,
      ...extraImages.filter((img): img is string => Boolean(img)),
    ].filter((img): img is string => Boolean(img));
    if (!galleryImages.length) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }

    const listingCity = resolvePublishListingCity(profileDraft.location, user.city, coords);
    if (!listingCity) {
      showToast("Nurodykite miestą prieš publikuojant.", "error");
      pushAgentGreeting(LOCATION_MISSING_AGENT_PROMPT, {
        replaceThread: false,
        openSheet: true,
      });
      setSellerStep("confirmation");
      return;
    }
    const listingCoords = geocodeLocation(listingCity);
    if (coords) {
      const exact = distanceToListing(coords, {
        latitude: listingCoords.lat,
        longitude: listingCoords.lng,
        location: listingCity,
      });
      if (exact !== null) distKm = exact;
    }

    const publishCategory = resolveEffectiveListingCategory(
      profileDraft.category,
      profileDraft.attributes ?? {}
    );
    const publishTitle = profileDraft.title.trim() || "Skelbimas";
    const finalContact = resolveDraftContact(draftWithClientId, user);
    const publishDraft = {
      ...draftWithClientId,
      category: publishCategory,
      title: publishTitle,
      contact: finalContact,
    };

    const newListing: Listing = enrichListingWithConductorMeta(
      enrichListingCoords({
      id: listingId,
      title: publishTitle,
      price: profileDraft.price,
      priceLabel: profileDraft.priceLabel,
      location: listingCity,
      distanceKm: distKm,
      slug: generateListingSlug(publishTitle, listingCity),
      images: galleryImages,
      category: publishCategory,
      tags: attributesToTags(publishDraft),
      description: profileDraft.description,
      attributes: mergeSocialPublishAttributes(draftWithClientId.attributes, listingSocialPublish),
      status: "active",
      sellerId: user.id,
      createdAt,
      expiresAt: defaultExpiresAt(createdAt),
      contact: finalContact,
      hasVideo: sellerHasVideo,
      vinVerified: vinOk,
      providerVerified:
        profileDraft.category === "services" && isVerifiedServiceProvider(user),
      minNegotiationPrice: profileDraft.minNegotiationPrice,
      appraisalScore: profileDraft.appraisalScore,
      isVerified: profileDraft.isVerified ?? true,
      requiresReview: resolveListingRequiresReview(publishDraft, conductorPublish),
      imageAlt: profileDraft.imageAlt,
      imageTitle: profileDraft.imageTitle,
    }),
      conductorPublish
    );

    let published = newListing;

    if (isDataApiEnabled()) {
      void apiUpdateUser({
        ...user,
        avatar: sanitizeAvatarForApi(user.avatar),
      }).catch(() => {
        /* profile sync is best-effort — must not block publish */
      });

      const createRes = await apiCreateListing(newListing, user.id);
      if (!createRes.ok || !createRes.data?.id?.trim()) {
        setSellerStep("confirmation");
        const msg = `Nepavyko publikuoti: ${createRes.ok ? "server grąžino neteisingą atsakymą" : createRes.error}`;
        setSyncError(msg);
        showToast(msg, "error");
        pushAgentGreeting(msg, { openSheet: true });
        return;
      }

      published = withDefaultExpiry({
        ...createRes.data,
        category: publishCategory,
        tags: newListing.tags,
        images: newListing.images.length ? newListing.images : createRes.data.images,
        slug: createRes.data.slug ?? newListing.slug,
      });

      // Only now we finalize local UI state as "published".
      setListings((prev) => [published, ...prev]);
      setLastPublishedListing(published);
      setSellerStep("published");
      showToast(
        published.requiresReview
          ? "Skelbimas išsaugotas — moderatorius peržiūrės per 24 val. Kol kas jis nerodomas viešai."
          : "Skelbimas sėkmingai įkeltas!",
        published.requiresReview ? "info" : "success"
      );

      await refreshListingsCatalog();
    } else {
      // Demo/local mode: publish immediately.
      setListings((prev) => [newListing, ...prev]);
      setLastPublishedListing(newListing);
      setSellerStep("published");
      showToast(
        newListing.requiresReview
          ? "Skelbimas išsaugotas — moderatorius peržiūrės per 24 val. Kol kas jis nerodomas viešai."
          : "Skelbimas sėkmingai įkeltas!",
        newListing.requiresReview ? "info" : "success"
      );
    }

    scheduleSellerEngagementPush(published.id, published.location, published.title, {
      pendingReview: Boolean(published.requiresReview),
    });
    scheduleListingSocialPublish(published, listingSocialPublish, (result) => {
      if (result.facebook === "opened") {
        showToast("Facebook dalijimasis inicijuotas.", "info");
      }
      if (result.anonser === "queued") {
        showToast("Anonser.lt sinchronizacija suplanuota.", "info");
      }
    });
    notifyListingPublishComplete(publishCategory, 1);
    } finally {
      isPublishingRef.current = false;
      setIsPublishingListing(false);
    }
  }, [
    aiDraft,
    sellerPreviewImage,
    sellerPreviewImages,
    sellerHasVideo,
    user,
    listings,
    buyerCoords,
    authHydrated,
    isAuthenticated,
    openAuthModal,
    scheduleSellerEngagementPush,
    setListings,
    setSyncError,
    showToast,
    showConfirm,
    editingListingId,
    resetSellerFlow,
    listingSocialPublish,
    photoCategoryMismatch,
    refreshListingsCatalog,
    trackEvent,
  ]);

  const publishBulkClothingListings = useCallback(
    async (drafts: AiExtractedListing[]) => {
      if (!drafts.length) return;
      if (!authHydrated) {
        showToast("Palaukite — kraunama paskyra…", "info");
        return;
      }
      if (!isAuthenticated) {
        openAuthModal("/add");
        return;
      }

      const bulkListingId = `bulk-${Date.now()}`;
      const listingImage = await prepareListingImageForApi(
        sellerPreviewImage,
        bulkListingId
      );
      if (!listingImage) {
        showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
        return;
      }

      const coords = buyerCoords ?? (await getUserCoords({ requestPermission: true }));
      const bulkSnapshot = buildConductorPublishSnapshot(drafts[0]!);
      if (bulkSnapshot.sources.length) {
        trackEvent("conductor_publish", {
          sources: bulkSnapshot.sources.join(","),
          category: "clothing",
          mergedAt: bulkSnapshot.mergedAt,
          bulk: true,
          count: drafts.length,
        });
      }
      let published = 0;

      for (const draft of drafts) {
        if (!draft.title.trim() || draft.price <= 0) continue;
        const snapshot = buildConductorPublishSnapshot(draft);
        const listingCity = resolvePublishListingCity(draft.location, user.city, coords);
        if (!listingCity) continue;
        const listingCoords = geocodeLocation(listingCity);
        let distKm = 0.5;
        if (coords) {
          const exact = distanceToListing(coords, {
            latitude: listingCoords.lat,
            longitude: listingCoords.lng,
            location: listingCity,
          });
          if (exact !== null) distKm = exact;
        }

        const createdAt = new Date().toISOString();
        const newListing: Listing = enrichListingWithConductorMeta(
          enrichListingCoords({
          id: `l-${Date.now()}-${published}`,
          title: draft.title,
          price: draft.price,
          priceLabel: draft.priceLabel,
          location: listingCity,
          distanceKm: distKm,
          slug: generateListingSlug(draft.title, listingCity),
          images: [listingImage],
          category: "clothing",
          tags: attributesToTags(draft),
          description: draft.description,
          attributes: mergeSocialPublishAttributes(draft.attributes, listingSocialPublish),
          status: "active",
          sellerId: user.id,
          createdAt,
          expiresAt: defaultExpiresAt(createdAt),
          contact: draft.contact,
          hasVideo: false,
          vinVerified: false,
          providerVerified: false,
          isVerified: draft.isVerified ?? true,
          requiresReview: resolveListingRequiresReview(draft, snapshot),
          imageAlt: draft.imageAlt,
          imageTitle: draft.imageTitle,
        }),
          snapshot
        );

        setListings((prev) => [newListing, ...prev]);
        published += 1;

        if (isDataApiEnabled()) {
          const createRes = await apiCreateListing(newListing, user.id);
          if (createRes.ok) {
            const synced = withDefaultExpiry({
              ...createRes.data,
              slug: createRes.data.slug ?? newListing.slug,
            });
            setListings((prev) =>
              prev.map((l) => (l.id === newListing.id ? synced : l))
            );
          }
        }
      }

      if (published > 0) {
        const anyPending = drafts.some((d, i) => {
          const snapshot = buildConductorPublishSnapshot(drafts[i]!);
          return resolveListingRequiresReview(d, snapshot);
        });
        showToast(
          anyPending
            ? `${published} skelbim${published === 1 ? "as" : "ai"} laukia moderatoriaus peržiūros.`
            : `${published} drabužių skelbim${published === 1 ? "as" : "ai"} sėkmingai įkelti!`,
          anyPending ? "info" : "success"
        );
        notifyListingPublishComplete("clothing", published);
        resetSellerFlow();
      } else {
        showToast("Nepavyko publikuoti — patikrinkite kainas ir pavadinimus.", "error");
      }
    },
    [
      authHydrated,
      isAuthenticated,
      openAuthModal,
      sellerPreviewImage,
      buyerCoords,
      user,
      listingSocialPublish,
      setListings,
      showToast,
      resetSellerFlow,
      trackEvent,
    ]
  );

  const startEditListingFlow = useCallback(
    (listing: Listing) => {
      if (listing.sellerId !== user.id) {
        showToast("Neturite teisių redaguoti šio skelbimo.", "error");
        return;
      }
      resetSellerFlow();
      writeListingEditSession({
        listingId: listing.id,
        title: listing.title,
        price: listing.price,
        description: listing.description ?? "",
        location: listing.location,
        category: listing.category,
        attributes: listing.attributes ?? {},
      });
      router.push("/");
    },
    [user.id, showToast, resetSellerFlow, router]
  );

  const updateSellerMedia = useCallback(
    (patch: { imageDataUrl?: string | null; videoUrl?: string }) => {
      if (patch.imageDataUrl !== undefined) setSellerPreviewImage(patch.imageDataUrl);
      if (patch.videoUrl !== undefined) {
        setSellerVideoUrl(patch.videoUrl);
        const vid = parseVideoUrl(patch.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (patch.imageDataUrl === undefined) {
          setSellerPreviewImage((prev) => {
            if (prev?.startsWith("data:")) return prev;
            return vid.thumbnail ?? null;
          });
        }
      }
    },
    []
  );

  const startUploadFlow = useCallback(async () => {
    if (!requireAuthForListing("/add/")) return;
    router.push("/add/");
  }, [requireAuthForListing, router]);

  const startVoiceFlow = useCallback(() => {
    if (!requireAuthForListing("/add/")) return;
    router.push("/add/");
  }, [requireAuthForListing, router]);

  const cancelSellerFlow = useCallback(() => {
    abortSellerProcessing();
    resetSellerFlow();
  }, [resetSellerFlow, abortSellerProcessing]);

  useEffect(() => {
    if (
      aiDraft &&
      (sellerStep === "confirmation" ||
        sellerStep === "processing" ||
        sellerStep === "published")
    ) {
      setDetectedAdaptiveKey(listingToAdaptiveKey(aiDraft.category));
      setChameleonTheme(aiDraft.category === "clothing" ? "wardrobe" : "flux");
      return;
    }
    if (sellerStep === "idle") {
      setDetectedAdaptiveKey(null);
      setChameleonTheme("flux");
    }
  }, [
    aiDraft,
    sellerStep,
    setDetectedAdaptiveKey,
    setChameleonTheme,
  ]);

  const value = useMemo<SellerFlowContextValue>(
    () => ({
      sellerStep,
      sellerInputMode,
      sellerUserPrompt,
      aiDraft,
      aiManualFallback,
      sellerPreviewImage,
      sellerPreviewImages,
      sellerVideoUrl,
      updateSellerMedia,
      startUploadFlow,
      startVoiceFlow,
      completeVoiceRecording,
      cancelVoiceRecording,
      updateAiDraft,
      isPublishingListing,
      publishListing,
      publishBulkClothingListings,
      cancelSellerFlow,
      lastPublishedListing,
      finishPublishedFlow,
      submitSellerContent,
      reprocessConfirmationPhoto,
      applyAgentListingDraft,
      applyAgentWardrobeBulk,
      stageWardrobeBulkPreview,
      pendingWardrobeBulkItems,
      pendingWardrobeVoice,
      importListingFromUrl,
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
      openManualListingWizard,
      startEditListingFlow,
      listingSocialPublish,
      updateListingSocialPublish,
      revertPhotoCategoryMismatch,
      acceptPhotoCategoryMismatch,
      photoCategoryMismatch,
      sellerVisionRecoveryActive,
      submitSellerClarification,
    }),
    [
      sellerStep,
      sellerInputMode,
      sellerUserPrompt,
      aiDraft,
      aiManualFallback,
      sellerPreviewImage,
      sellerPreviewImages,
      sellerVideoUrl,
      updateSellerMedia,
      startUploadFlow,
      startVoiceFlow,
      completeVoiceRecording,
      cancelVoiceRecording,
      updateAiDraft,
      isPublishingListing,
      publishListing,
      publishBulkClothingListings,
      cancelSellerFlow,
      lastPublishedListing,
      finishPublishedFlow,
      submitSellerContent,
      reprocessConfirmationPhoto,
      applyAgentListingDraft,
      applyAgentWardrobeBulk,
      stageWardrobeBulkPreview,
      pendingWardrobeBulkItems,
      pendingWardrobeVoice,
      importListingFromUrl,
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
      openManualListingWizard,
      startEditListingFlow,
      listingSocialPublish,
      updateListingSocialPublish,
      revertPhotoCategoryMismatch,
      acceptPhotoCategoryMismatch,
      photoCategoryMismatch,
      sellerVisionRecoveryActive,
      submitSellerClarification,
    ]
  );

  return (
    <SellerFlowContext.Provider value={value}>
      {children}
    </SellerFlowContext.Provider>
  );
}

export function useSellerFlow(): SellerFlowContextValue {
  const ctx = useContext(SellerFlowContext);
  if (!ctx) throw new Error("useSellerFlow must be used within SellerFlowContextProvider");
  return ctx;
}

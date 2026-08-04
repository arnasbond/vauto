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
import { getUserCoords, isCoordsInLithuania } from "@/lib/geolocation";
import {
  coordsFromListingAttributes,
  distanceToListing,
  enrichListingCoords,
  isUnresolvedListingLocation,
  tryGeocodeLocation,
} from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceProvider, verifyVin } from "@/lib/trust";
import { apiCreateListing, apiUpdateListing, apiUpdateUser, apiUploadMediaResult, parseApiErrorMessage, SESSION_EXPIRED_MESSAGE } from "@/lib/api/client";
import { loadAccessToken } from "@/lib/auth/session";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";
import { draftToListingPatch, type ListingEditPatch } from "@/lib/listing-edit";
import { clearListingEditSession } from "@/lib/listing-edit-session";
import { EditListingModal } from "@/components/dashboard/EditListingModal";
import {
  collectListingGalleryCandidates,
  filterSessionListingImages,
  isListingPlaceholderUrl,
} from "@/lib/listing-image";
import { stripHallucinatedListingDefaults } from "@/lib/conversation-listing-draft";
import { normalizeKnownListingCity } from "@/lib/city-resolve";
import {
  LOCATION_MISSING_AGENT_PROMPT,
  nearestLtCityFromCoords,
  resolveDynamicListingLocation,
  resolveEffectiveUserCity,
  resolveListingLocationLabel,
  resolvePublishListingCity,
  UNKNOWN_LISTING_LOCATION_LABEL,
  verifiedProfileCity,
} from "@/lib/listing-location-context";
import {
  hasListingPhoto,
  LISTING_PHOTO_REQUIRED_MESSAGE,
  LISTING_PHOTO_UPLOAD_FAILED_MESSAGE,
} from "@/lib/listing-form-validation";
import {
  listingCategoryAllowsPhotoless,
  capListingGalleryUrls,
} from "@vauto/shared/listing-photo-policy";
import { LISTING_PLACEHOLDER_IMAGE } from "@/lib/listing-image";
import { sanitizeListingAttributesForPersistence } from "@vauto/shared/listing-attributes-sanitize";
import { registerPushNotifications } from "@/lib/push-registration";
import {
  completeHeroListingFlow,
  logHeroContactReask,
  markHeroListingFlowStart,
} from "@/lib/hero-kpis";
import {
  evaluatePrePublishReadiness,
} from "@/lib/pre-publish-validation";
import {
  buildPublishValidationToast,
  buildPostVisionHeroMessage,
  isHeroFlowLocked,
  POST_VISION_PUBLISH_CHIPS,
  resolveLockedListingFlowState,
} from "@/lib/listing-conversational-flow";
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
  finalizeListingDraft,
  resolveEffectiveListingCategory,
  sanitizeAttributesForCategory,
} from "@/lib/listing-attribute-isolation";
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
  VISION_CONVERSATIONAL_RECOVERY_PROMPT,
} from "@/lib/ai-conversational-recovery";
import { completeVoiceTeardown } from "@/lib/voice-teardown";
import { isUnclearTranscript } from "@/lib/voice-graceful";
import { applyProfileToListingDraft, injectProfileContactsForPublish, resolveDraftContact, hasProfileListingContact } from "@/lib/profile-listing-sync";
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

function formatPublishSaveError(raw: string): string {
  return `Nepavyko išsaugoti skelbimo: ${parseApiErrorMessage(raw)}`;
}

function resolvePublishApiFailure(
  status: number | undefined,
  raw: string
): { message: string; detail: string; sessionExpired: boolean } {
  const sessionExpired = status === 401 || status === 403;
  if (sessionExpired) {
    return {
      message: SESSION_EXPIRED_MESSAGE,
      detail: SESSION_EXPIRED_MESSAGE,
      sessionExpired: true,
    };
  }
  const detail = parseApiErrorMessage(raw);
  // 402 is the payout gate: the server message already names the exact fix, so
  // wrapping it in a generic save error would only hide the instruction.
  if (status === 402) {
    return { message: detail, detail, sessionExpired: false };
  }
  return {
    message: formatPublishSaveError(raw),
    detail,
    sessionExpired: false,
  };
}

/**
 * DEFERRED permanent storage — called only from publishListing / edit-save.
 * Pre-flight chat Vision never enters here; it keeps high-res data URLs in session memory.
 * Returns HTTPS Cloudinary URL only — never a data: URL (feed strips those → blank cards).
 */
async function prepareListingImageForApi(
  src: string | null | undefined,
  listingId?: string
): Promise<string | null> {
  if (!src?.trim()) return null;
  let image = (await resolveImageForUpload(src)) ?? src.trim();
  if (/^https?:\/\//i.test(image)) return image;
  if (!image.startsWith("data:image")) {
    console.error("[prepareListingImageForApi] unsupported image kind:", image.slice(0, 48));
    return null;
  }

  // Publish-size compress — force JPEG canvas output for Cloudinary compatibility.
  image = await compressDataUrl(image, {
    maxDim: 1024,
    quality: 0.72,
    maxChars: 180_000,
    force: true,
  });
  if (!image.startsWith("data:image")) {
    console.error("[prepareListingImageForApi] compress produced non-data URL");
    return null;
  }

  // Retry Cloudinary — transient Render/OOM failures are common on first attempt.
  let lastError = "";
  let lastCode = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await apiUploadMediaResult(image, listingId);
    if (result.url && /^https?:\/\//i.test(result.url)) return result.url;
    lastError = result.error || lastError;
    lastCode = result.code || lastCode;
    console.error("[prepareListingImageForApi] upload attempt failed:", {
      attempt: attempt + 1,
      listingId,
      code: result.code,
      error: result.error,
      bytes: image.length,
    });
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
    }
  }
  console.error("[prepareListingImageForApi] all upload attempts failed:", {
    listingId,
    code: lastCode,
    error: lastError,
  });
  return null;
}

import type { PrePublishVisibilityId } from "@/lib/listing-publish-visibility";
import {
  buildPrePublishVisibilityCheckout,
  getPrePublishVisibilityOption,
} from "@/lib/listing-publish-visibility";
import {
  resolvePublishListingDescription,
  sanitizeListingTitle,
} from "@/lib/listing-text-sanitize";
import { ensureRichSalesCopyBeforePublish } from "@vauto/shared/ensure-rich-sales-copy";
import { applyOmnivaEligibilityToDraft } from "@vauto/shared/omniva-locker-eligibility";
import {
  isNegotiableListingPrice,
  NEGOTIABLE_PRICE_LABEL,
} from "@vauto/shared/negotiable-price";
import { computeVatBreakdown } from "@vauto/shared/vat-pricing";
import { parseDocumentUrlsFromAttributes } from "@/lib/listing-gallery-roles";
import { withSellerDisplayNameAttribute } from "@/lib/seller-display";
import type { CheckoutSession } from "@/lib/monetization-catalog";
import {
  clearAllListingDrafts,
  removeMultiListingDraft,
  upsertMultiListingDraft,
} from "@/lib/listing-draft-storage";

export type PublishListingResult =
  | { ok: true; listing: Listing; visibilityCheckout?: CheckoutSession | null }
  | { ok: false; error: string; sessionExpired?: boolean; prePublishBlocked?: boolean };

export interface PublishListingOptions {
  visibilityId?: PrePublishVisibilityId;
  /** Agent chat pending attachments — same sources PrePublish readiness uses. */
  pendingImageUrls?: string[];
  /**
   * When true, skip chat/toast success notify — Lottie paper-plane celebration
   * already shows „Skelbimas publikuotas!".
   */
  skipSuccessNotify?: boolean;
  /** Flush PrePublish form price into publish even if React state hasn't committed yet. */
  priceOverride?: number;
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
    imageDataUrls?: string[];
    videoUrl?: string;
  }) => void;
  startUploadFlow: () => Promise<void>;
  startVoiceFlow: () => void;
  completeVoiceRecording: (transcript: string | null) => void;
  cancelVoiceRecording: () => void;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  isPublishingListing: boolean;
  publishListing: (opts?: PublishListingOptions) => Promise<PublishListingResult>;
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
  startListingFromQuery: (text: string) => boolean;
  pendingSellerQuery: string | null;
  consumePendingSellerQuery: () => string | null;
  startEditListingFlow: (
    listing: Listing,
    options?: { stayOnPage?: boolean }
  ) => void;
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
  const { user, isAuthenticated, authHydrated, openAuthModal, requireAuthForListing, logout } = useAuth();
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
  /** Dedicated form modal — never redirects to `/` for catalog/detail "Redaguoti". */
  const [editModalListing, setEditModalListing] = useState<Listing | null>(null);
  const [editModalSaving, setEditModalSaving] = useState(false);
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
    setEditModalListing(null);
    setEditModalSaving(false);
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
      if (opts?.previewImage || (opts?.previewImages?.length ?? 0) > 0) {
        markHeroListingFlowStart(`processing_${mode}`);
        trackEvent("kpi_listing_flow_start", { source: `processing_${mode}` });
      } else if (opts?.transcript?.trim()) {
        markHeroListingFlowStart(`processing_${mode}_text`);
        trackEvent("kpi_listing_flow_start", { source: `processing_${mode}_text` });
      }
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
            userCity: resolveEffectiveUserCity({
              profileCity: user.city,
              geoCoords: buyerCoords,
            }),
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
        if (reason === "timeout") {
          notifyAgentError("ai_timeout", "AI analizė užtruko per ilgai");
        } else if (reason === "invalid_extraction") {
          notifyAgentError("ai_invalid", "Nepavyko automatiškai atpažinti turinio");
        }
        // Constitution: no classic form fallback — always recover in agent chat.
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

        // Soft geocode only — never invent Vilnius/Kaunas. Country-only → empty for manual edit.
        const rawLoc = String(next.location ?? "").trim();
        const resolvedLoc = isUnresolvedListingLocation(rawLoc) ? "" : rawLoc;
        const geo = resolvedLoc ? tryGeocodeLocation(resolvedLoc) : null;
        const nextAttrs = { ...(next.attributes ?? {}) };
        if (geo) {
          nextAttrs._geoLat = String(geo.lat);
          nextAttrs._geoLng = String(geo.lng);
        } else {
          delete nextAttrs._geoLat;
          delete nextAttrs._geoLng;
        }
        next = {
          ...next,
          location: resolvedLoc,
          attributes: nextAttrs,
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

        {
          const needsClarification =
            shouldClarifyPhotoUpload(next) &&
            (mode === "upload" || mode === "combined");

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

          if (needsClarification) {
            // Multi-object: pick first, then DRAFT_READY with full hero summary.
            setAiDraft({
              ...cleaned,
              listingFlowState: "AWAITING_PHOTOS",
            });
            pushAgentGreeting(buildPhotoClarificationMessage(next), {
              quickReplies: extractVisionChoiceChips(next, "sell"),
            });
          } else {
            // Hero: Vision → completed listing → more photos vs publish gate.
            setAiDraft({
              ...cleaned,
              listingFlowState: "DRAFT_READY",
              choiceChips: undefined,
              clarificationPrompt: undefined,
            });
            pushAgentGreeting(buildPostVisionHeroMessage(cleaned), {
              quickReplies: [...POST_VISION_PUBLISH_CHIPS],
            });
          }
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
    [user.city, user.phone, user.email, sellerPreviewImage, isProcessingStale, showToast, trackEvent, syncDraftWithProfile, enterConversationalRecovery]
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
      // Always union prior + incoming galleries so multi-photo chat uploads are not
      // collapsed to a single Vision cover. Dedupe via filterSessionListingImages.
      const incomingGallery = (draft.orderedImageUrls ?? [])
        .map((u) => String(u ?? "").trim())
        .filter(Boolean);
      const priorGallery = (previousDraft?.orderedImageUrls ?? [])
        .map((u) => String(u ?? "").trim())
        .filter(Boolean);
      const coverHint = imageUrl ? String(imageUrl).trim() : "";
      const gallerySource = [
        ...incomingGallery,
        ...(coverHint ? [coverHint] : []),
        ...priorGallery,
      ];
      const mergedAttrs = {
        ...(previousDraft?.attributes ?? {}),
        ...(draft.attributes ?? {}),
      };
      // Product angles wrongly tagged as documents (Vision cover-only indexes) must
      // stay in the public gallery — only keep docs that are NOT in the product set.
      const productSet = new Set(gallerySource);
      const rawDocs = parseDocumentUrlsFromAttributes(mergedAttrs);
      const explicitDocs = rawDocs.filter((u) => !productSet.has(u));
      const nextAttrs = { ...mergedAttrs };
      if (explicitDocs.length) {
        nextAttrs.documentImageUrls = explicitDocs.join("|");
        nextAttrs.documentImageCount = String(explicitDocs.length);
      } else {
        delete nextAttrs.documentImageUrls;
        delete nextAttrs.documentImageCount;
      }
      const galleryPhotos = capListingGalleryUrls(
        filterSessionListingImages(gallerySource, {
          attributes: nextAttrs,
          documentUrls: explicitDocs,
        }),
        draft.category ?? previousDraft?.category
      );
      const draftWithPhotos =
        galleryPhotos.length > 0
          ? { ...draft, orderedImageUrls: galleryPhotos, attributes: nextAttrs }
          : { ...draft, attributes: nextAttrs };
      const { draft: merged } = commitConductorDraft(
        draftWithPhotos,
        draftSource,
        previousDraft
      );
      const mergedDraft = { ...draftWithPhotos, ...merged } as AiExtractedListing;
      if (galleryPhotos.length) {
        mergedDraft.orderedImageUrls = galleryPhotos;
      }
      const sourceText = [mergedDraft.title, mergedDraft.description].filter(Boolean).join(" ");
      let enriched = enrichVehicleListingDraft(mergedDraft, [sourceText]);
      enriched = enrichClothingListingDraft(enriched, sourceText);
      if (galleryPhotos.length) {
        enriched = { ...enriched, orderedImageUrls: galleryPhotos };
      }
      const previousCategory = previousDraft?.category ?? null;
      const previousAttributes = previousDraft?.attributes ?? null;
      const hasPhotos =
        galleryPhotos.length > 0 ||
        (previousDraft?.orderedImageUrls?.length ?? 0) > 0 ||
        Boolean(imageUrl);
      const inferredIncoming =
        enriched.listingFlowState ??
        (hasPhotos ? ("DRAFT_READY" as const) : undefined);
      const lockedFlowState = resolveLockedListingFlowState(
        previousDraft?.listingFlowState,
        inferredIncoming
      );
      const finalized = ensureClientDraftId(
        finalizeListingDraft(enriched, previousCategory, previousAttributes)
      );
      const syncedForAgent = syncDraftWithProfile({
        ...finalized,
        ...(galleryPhotos.length ? { orderedImageUrls: galleryPhotos } : {}),
        ...(lockedFlowState ? { listingFlowState: lockedFlowState } : {}),
      });
      setAiDraft(syncedForAgent);
      const coverForMulti =
        galleryPhotos[0] ?? imageUrl ?? sellerPreviewImageRef.current ?? null;
      if (syncedForAgent.title?.trim()) {
        upsertMultiListingDraft(syncedForAgent, coverForMulti);
      }
      setSellerInputMode("text");
      setSellerUserPrompt(enriched.description ?? enriched.title);
      if (galleryPhotos.length) {
        setSellerPreviewImages(galleryPhotos);
        setSellerPreviewImage(galleryPhotos[0] ?? null);
      } else if (imageUrl) {
        setSellerPreviewImage(imageUrl);
      }
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
      // Hero SM owns DRAFT_READY / confirmation dialogue — never inject legacy media chips.
      if (
        (galleryPhotos.length || imageUrl) &&
        !isHeroFlowLocked(lockedFlowState) &&
        lockedFlowState !== "DRAFT_READY"
      ) {
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
      const cover = opts?.imageUrl?.trim();
      const stamped = items.map((item) =>
        item.imageUrl?.trim()
          ? item
          : cover
            ? { ...item, imageUrl: cover }
            : item
      );
      setPendingWardrobeBulkItems(stamped.length > 1 ? stamped : null);
      setPendingWardrobeVoice(opts?.voiceAnnouncement?.trim() || null);
      const firstDraft = wardrobeItemToDraft(
        stamped[0]!,
        user.phone,
        verifiedProfileCity(user.city)
      );
      const { draft: merged } = commitConductorDraft(firstDraft, "agent", null);
      const mergedDraft = { ...firstDraft, ...merged } as AiExtractedListing;
      setAiDraft(syncDraftWithProfile(mergedDraft));
      setSellerInputMode("upload");
      setSellerUserPrompt(opts?.voiceAnnouncement ?? mergedDraft.title);
      const firstCover = stamped[0]?.imageUrl ?? cover;
      if (firstCover) setSellerPreviewImage(firstCover);
      setChameleonTheme("wardrobe");
      setSellerStep("idle");
      showToast(
        opts?.voiceAnnouncement ??
          (stamped.length > 1
            ? `AI aptiko ${stamped.length} drabužius — tęskime pokalbį.`
            : "AI paruošė drabužio skelbimą — tęskime pokalbį."),
        "success"
      );
    },
    [requireAuthForListing, setChameleonTheme, showToast, user.phone, user.city, syncDraftWithProfile]
  );

  const stageWardrobeBulkPreview = useCallback(
    (items: WardrobeDraftItem[], voiceAnnouncement?: string) => {
      setPendingWardrobeBulkItems(items.length > 1 ? items : null);
      if (voiceAnnouncement?.trim()) {
        setPendingWardrobeVoice(voiceAnnouncement.trim());
      }
    },
    []
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
      // Seed a minimal draft when price/media/title arrives before Vision returns —
      // never drop a typed price into the void (stops „Kokią kainą?“ loops).
      if (!prev) {
        const price = patch.price != null ? Number(patch.price) : 0;
        const hasPhotos = (patch.orderedImageUrls?.length ?? 0) > 0;
        const hasTitle = Boolean(String(patch.title ?? "").trim());
        if (!(price > 0) && !hasPhotos && !hasTitle) return prev;
        const seeded = createManualFallbackDraft({
          location: String(patch.location ?? user.city ?? "").trim(),
          contact: String(patch.contact ?? user.phone ?? "").trim(),
        });
        return syncDraftWithProfile({
          ...seeded,
          ...patch,
          price: price > 0 ? price : 0,
          title: String(patch.title ?? "").trim() || "Naujas skelbimas",
          listingFlowState: patch.listingFlowState ?? "DRAFTING_TEXT",
        });
      }

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

      const lockedFlowState = resolveLockedListingFlowState(
        prev.listingFlowState,
        patch.listingFlowState !== undefined
          ? patch.listingFlowState
          : prev.listingFlowState
      );

      return syncDraftWithProfile({
        ...prev,
        ...patch,
        category: nextCategory,
        attributes,
        ...(lockedFlowState ? { listingFlowState: lockedFlowState } : {}),
      });
    });
  }, [syncDraftWithProfile, user.city, user.phone]);

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

  const publishListing = useCallback(async (opts?: PublishListingOptions): Promise<PublishListingResult> => {
    if (isPublishingRef.current) {
      return { ok: false, error: "Skelbimas jau publikuojamas — palaukite." };
    }
    if (!aiDraft) {
      const msg = "Klaida: nėra skelbimo duomenų. Bandykite iš naujo.";
      showToast(msg, "error");
      return { ok: false, error: msg };
    }
    // Category-mismatch publish hard-block removed — Vision category is authoritative.
    if (!authHydrated) {
      const msg = "Palaukite — kraunama paskyra…";
      showToast(msg, "info");
      return { ok: false, error: msg };
    }

    const pendingImageUrls = (opts?.pendingImageUrls ?? [])
      .map((u) => String(u ?? "").trim())
      .filter(Boolean);
    const priceOverride =
      opts?.priceOverride != null &&
      Number.isFinite(opts.priceOverride) &&
      opts.priceOverride > 0
        ? opts.priceOverride
        : null;
    const draftForGate =
      aiDraft && priceOverride != null && !(aiDraft.price > 0)
        ? { ...aiDraft, price: priceOverride }
        : aiDraft;
    const prePublish = evaluatePrePublishReadiness({
      isAuthenticated,
      user,
      draft: draftForGate,
      previewImage: sellerPreviewImage,
      pendingImageUrls,
      orderedImageUrls: draftForGate?.orderedImageUrls ?? aiDraft.orderedImageUrls,
      editingListingId,
      geoCoords: buyerCoords,
    });
    if (prePublish.syncedDraft && prePublish.syncedDraft !== aiDraft) {
      setAiDraft(prePublish.syncedDraft);
    } else if (draftForGate && priceOverride != null && draftForGate !== aiDraft) {
      setAiDraft(draftForGate);
    }
    if (!prePublish.ok) {
      if (prePublish.missingAuth && !isAuthenticated) {
        openAuthModal("/");
      }
      const toast = buildPublishValidationToast(prePublish);
      showToast(toast.message, toast.type);
      return {
        ok: false,
        error: toast.message,
        prePublishBlocked: true,
      };
    }

    const profileDraftRaw =
      prePublish.syncedDraft ?? injectProfileContactsForPublish(aiDraft, user);
    // P0-2 — Guarantee Pass-2 / deferred / vehicle rich copy before live publish.
    // Omniva — stamp locker eligibility before listing goes live.
    const profileDraft = applyOmnivaEligibilityToDraft(
      ensureRichSalesCopyBeforePublish(profileDraftRaw)
    );
    if (profileDraft !== profileDraftRaw) {
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
        location: prePublish.resolvedCity || profileDraft.location,
        attributes: profileDraft.attributes,
      },
      {
        hasPhoto: prePublish.hasPhoto,
        conversational: true,
        profileContact: publishContact,
      }
    );

    if (!validation.canPublish) {
      const toast = buildPublishValidationToast(
        {
          missingAuth: false,
          missingPhoto: validation.needsPhoto,
          missingPhone: Boolean(
            validation.validationIssues?.some((x) => /kontakt/i.test(x))
          ),
          missingCity: Boolean(
            validation.validationIssues?.some((x) => /miest/i.test(x))
          ),
          missingPrice: validation.needsPrice,
        },
        {
          validationIssues: validation.validationIssues,
          blockMessage: validation.blockMessage,
        }
      );
      showToast(toast.message, toast.type);
      return { ok: false, error: toast.message, prePublishBlocked: true };
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
      if (!confirmed) return { ok: false, error: "Publikavimas atšauktas." };
    }

    const mod = moderateListing(profileDraft);
    if (!mod.allowed) {
      const msg = mod.reason ?? "Skelbimas atmestas moderacijos.";
      showToast(msg, "error");
      return { ok: false, error: msg };
    }

    // Match PrePublish readiness: agent photos may live on orderedImageUrls /
    // pending attachments even when sellerPreviewImage was never set.
    const photosOptional = listingCategoryAllowsPhotoless(profileDraft.category);
    const hasPublishablePhoto =
      prePublish.hasPhoto ||
      hasListingPhoto(sellerPreviewImage) ||
      sellerPreviewImages.some((url) => hasListingPhoto(url)) ||
      (profileDraft.orderedImageUrls?.some((url) => hasListingPhoto(url)) ?? false) ||
      pendingImageUrls.some((url) => hasListingPhoto(url));
    if (!editingListingId && !hasPublishablePhoto && !photosOptional) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return { ok: false, error: LISTING_PHOTO_REQUIRED_MESSAGE };
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
      return { ok: false, error: "Šis skelbimas jau publikuotas." };
    }

    if (editingListingId) {
      const existing = listings.find((l) => l.id === editingListingId);
      if (!existing || existing.sellerId !== user.id) {
        const msg = "Skelbimas nerastas arba neturite teisių.";
        showToast(msg, "error");
        return { ok: false, error: msg };
      }
      const editDescription = resolvePublishListingDescription({
        ...profileDraft,
        title: sanitizeListingTitle(profileDraft.title),
      });
      const patch = draftToListingPatch({
        ...profileDraft,
        contact: publishContact,
        description: editDescription,
        title: sanitizeListingTitle(profileDraft.title),
      });
      const editGallery = capListingGalleryUrls(
        filterSessionListingImages(
          resolveSellerGalleryImages(
            {
              orderedImageUrls: [
                ...(profileDraft.orderedImageUrls ?? []),
                ...pendingImageUrls,
              ].filter((url, i, arr) => arr.indexOf(url) === i),
            },
            [
              ...(sellerPreviewImage ? [sellerPreviewImage] : []),
              ...sellerPreviewImages.filter(Boolean),
            ].filter((url, i, arr) => arr.indexOf(url) === i)
          ),
          {
            attributes: profileDraft.attributes,
            documentUrls: parseDocumentUrlsFromAttributes(profileDraft.attributes),
          }
        ),
        profileDraft.category
      );
      const preparedEditImages = editGallery.length
        ? (
            await Promise.all(
              editGallery.map((src) => prepareListingImageForApi(src, editingListingId))
            )
          ).filter((img): img is string => Boolean(img))
        : filterSessionListingImages(existing.images);
      if (!preparedEditImages.length) {
        showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
        return { ok: false, error: LISTING_PHOTO_REQUIRED_MESSAGE };
      }
      const updated: Listing = enrichListingCoords({
        ...existing,
        ...patch,
        description: editDescription,
        contact: publishContact,
        attributes: withSellerDisplayNameAttribute(
          mergeSocialPublishAttributes(
            { ...(existing.attributes ?? {}), ...(patch.attributes ?? profileDraft.attributes) },
            listingSocialPublish
          ),
          user
        ),
        images: preparedEditImages,
        slug: generateListingSlug(patch.title ?? existing.title, patch.location ?? existing.location),
        hasVideo: sellerHasVideo,
      });
      setListings((prev) =>
        prev.map((l) => (l.id === editingListingId ? updated : l))
      );
      if (isDataApiEnabled()) {
        const res = await apiUpdateListing(editingListingId, user.id, {
          ...patch,
          description: editDescription,
          contact: publishContact,
          images: updated.images,
          attributes: updated.attributes,
        });
        if (!res.ok) {
          const msg = formatPublishSaveError(res.error);
          setSyncError(msg);
          showToast(msg, "error");
          return { ok: false, error: parseApiErrorMessage(res.error) };
        }
      }
      showToast("Skelbimas atnaujintas!", "success");
      resetSellerFlow();
      return { ok: true, listing: updated };
    }

    if (
      isDuplicateListing(draftWithClientId.title, user.id, listings, {
        clientDraftId,
        // Same-session AI drafts often reuse soft titles — don't false-positive.
        skipSoftAiDraft:
          String(draftWithClientId.attributes?.sellIntentActive ?? "") ===
            "true" ||
          String(draftWithClientId.attributes?.salesCopyGenerated ?? "") ===
            "true",
      })
    ) {
      const msg =
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą.";
      showToast(msg, "error");
      return { ok: false, error: msg };
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

    // Session photos only — never Unsplash/demo stock fillers from other listings.
    // Document/tech-passport evidence stays out of the public gallery.
    // Public gallery only — tech passport / registration evidence never becomes a
    // standalone cover or a second Mano skelbimai card image set.
    const documentEvidence = parseDocumentUrlsFromAttributes(profileDraft.attributes);
    const sessionCandidates = resolveSellerGalleryImages(
      {
        orderedImageUrls: [
          ...(profileDraft.orderedImageUrls ?? []),
          ...pendingImageUrls,
        ].filter((url, i, arr) => arr.indexOf(url) === i),
      },
      [
        ...(sellerPreviewImage ? [sellerPreviewImage] : []),
        ...sellerPreviewImages.filter(Boolean),
      ].filter((url, i, arr) => arr.indexOf(url) === i)
    );
    let syncedGallery = capListingGalleryUrls(
      filterSessionListingImages(sessionCandidates, {
        documentUrls: documentEvidence,
        attributes: profileDraft.attributes,
      }),
      profileDraft.category
    );
    // If document-role ban wiped every thumb the user can still see, fall back to
    // session candidates (still no stock URLs) so publish does not hit "image is required".
    if (!syncedGallery.length && sessionCandidates.length) {
      syncedGallery = capListingGalleryUrls(
        filterSessionListingImages(sessionCandidates, { documentUrls: [] }),
        profileDraft.category
      );
    }

    // Sequential uploads — parallel 6× sharp/Cloudinary on Render often 503/OOM.
    const coords = await coordsPromise;
    const preparedGallery: string[] = [];
    let uploadFailures = 0;
    for (const src of syncedGallery) {
      const prepared = await prepareListingImageForApi(src, listingId);
      if (prepared && /^https?:\/\//i.test(prepared)) {
        preparedGallery.push(prepared);
      } else if (src?.trim()) {
        uploadFailures += 1;
      }
    }
    const httpImages = preparedGallery.filter((u) => /^https?:\/\//i.test(u));
    // Public catalog only accepts HTTPS. Data URLs publish "successfully" then vanish
    // from feed SELECT (CASE WHEN image LIKE 'data:%' THEN '') → blank cards.
    let galleryImages = capListingGalleryUrls(httpImages, profileDraft.category);
    if (!galleryImages.length && photosOptional) {
      galleryImages = [LISTING_PLACEHOLDER_IMAGE];
    }
    if (!galleryImages.length) {
      const msg =
        uploadFailures > 0 || syncedGallery.length > 0
          ? "Nepavyko įkelti nuotraukų į saugyklą. Patikrinkite ryšį ir bandykite publikuoti dar kartą."
          : LISTING_PHOTO_REQUIRED_MESSAGE;
      showToast(msg, "error");
      return { ok: false, error: msg };
    }

    const listingCityRaw = resolvePublishListingCity(
      profileDraft.location,
      user.city,
      coords
    );
    const gpsCoords =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? coords
        : null;
    const cityCoords = listingCityRaw
      ? tryGeocodeLocation(listingCityRaw)
      : null;
    const attrCoords = coordsFromListingAttributes(profileDraft.attributes);
    // Prefer precise GPS when granted; otherwise city geocode / soft draft attrs.
    const listingCoords =
      gpsCoords ?? cityCoords ?? attrCoords ?? null;

    // Allow publish with GPS and/or a typed city — never invent a municipality.
    if (!listingCityRaw && !listingCoords) {
      showToast(
        "Nurodykite miestą arba leiskite GPS lokaciją — automatiškai miesto nepriskiriame.",
        "info"
      );
      if (verifiedProfileCity(user.city)) {
        logHeroContactReask("city", "publish_location_missing_prompt");
        trackEvent("kpi_contact_reask", {
          field: "city",
          source: "publish_location_missing_prompt",
          profileHad: true,
        });
      }
      pushAgentGreeting(LOCATION_MISSING_AGENT_PROMPT, {
        replaceThread: false,
        openSheet: true,
      });
      setSellerStep("idle");
      return { ok: false, error: "Nenurodyta lokacija.", prePublishBlocked: true };
    }

    const listingCity =
      listingCityRaw ||
      (gpsCoords && isCoordsInLithuania(gpsCoords)
        ? nearestLtCityFromCoords(gpsCoords)
        : "") ||
      resolveListingLocationLabel({
        draftLocation: profileDraft.location,
        profileCity: user.city,
        geoCoords: gpsCoords,
      }) ||
      UNKNOWN_LISTING_LOCATION_LABEL;

    if (gpsCoords && listingCoords) {
      const exact = distanceToListing(gpsCoords, {
        latitude: listingCoords.lat,
        longitude: listingCoords.lng,
        location: listingCity,
      });
      if (exact !== null) distKm = exact;
    }

    // Selected extras (Boost/Premium) are paid after publish via checkout.
    // Base listing is always created as free — never grant promote on create.
    const selectedVisibility = getPrePublishVisibilityOption(
      opts?.visibilityId ?? "standard"
    );

    const publishCategory = resolveEffectiveListingCategory(
      profileDraft.category,
      profileDraft.attributes ?? {}
    );
    const publishTitle = sanitizeListingTitle(profileDraft.title);
    const publishDescription = resolvePublishListingDescription({
      ...profileDraft,
      title: publishTitle,
    });
    const finalContact = resolveDraftContact(draftWithClientId, user);
    const vatCodeForPublish = String(
      user.vatCode ??
        draftWithClientId.attributes?.vatCode ??
        draftWithClientId.attributes?.vat_code ??
        ""
    ).trim();
    const vatForPublish = computeVatBreakdown(
      profileDraft.price ?? 0,
      vatCodeForPublish
    );
    const publishPriceLabel =
      profileDraft.priceLabel ??
      (isNegotiableListingPrice(profileDraft)
        ? NEGOTIABLE_PRICE_LABEL
        : undefined) ??
      (vatForPublish.hasVat ? vatForPublish.labelGross : undefined);
    const publishDraft = {
      ...draftWithClientId,
      category: publishCategory,
      title: publishTitle,
      description: publishDescription,
      contact: finalContact,
      priceLabel: publishPriceLabel,
    };
    const publishAttributes = withSellerDisplayNameAttribute(
      mergeSocialPublishAttributes(
        {
          ...(draftWithClientId.attributes ?? {}),
          ...(vatCodeForPublish ? { vatCode: vatCodeForPublish } : {}),
        },
        listingSocialPublish
      ),
      user
    );

    const newListing: Listing = enrichListingWithConductorMeta(
      enrichListingCoords({
      id: listingId,
      title: publishTitle,
      price: profileDraft.price,
      priceLabel: publishPriceLabel,
      location: listingCity,
      ...(listingCoords
        ? { latitude: listingCoords.lat, longitude: listingCoords.lng }
        : {}),
      distanceKm: distKm,
      slug: generateListingSlug(publishTitle, listingCity),
      images: galleryImages,
      category: publishCategory,
      tags: attributesToTags(publishDraft),
      description: publishDescription,
      attributes: publishAttributes,
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
      allowPastomatas: profileDraft.allowPastomatas ?? true,
      isAiTwinActive:
        String(profileDraft.attributes?.isAiTwinActive ?? "").trim().toLowerCase() === "true",
      visibilityTier: "free",
      promoted: false,
    }),
      conductorPublish
    );

    let published = newListing;

    if (isDataApiEnabled()) {
      if (!loadAccessToken()) {
        const msg = SESSION_EXPIRED_MESSAGE;
        showToast(msg, "error");
        logout();
        openAuthModal("/");
        return { ok: false, error: msg, sessionExpired: true };
      }

      void apiUpdateUser({
        ...user,
        avatar: sanitizeAvatarForApi(user.avatar),
      }).catch(() => {
        /* profile sync is best-effort — must not block publish */
      });

      const createRes = await apiCreateListing(
        { ...newListing, sellerId: user.id },
        user.id
      );
      if (!createRes.ok || !createRes.data?.id?.trim()) {
        setSellerStep("idle");
        const failure = resolvePublishApiFailure(createRes.ok ? undefined : createRes.status, createRes.ok ? "serveris grąžino neteisingą atsakymą" : createRes.error);
        setSyncError(failure.message);
        showToast(failure.message, "error");
        pushAgentGreeting(failure.message, { openSheet: true, replaceThread: false });
        if (failure.sessionExpired) {
          logout();
          openAuthModal("/");
        }
        return { ok: false, error: failure.detail, sessionExpired: failure.sessionExpired };
      }

      published = withDefaultExpiry({
        ...createRes.data,
        category: publishCategory,
        title: publishTitle,
        description: publishDescription,
        tags: newListing.tags,
        images: galleryImages,
        attributes: publishAttributes,
        slug: createRes.data.slug ?? newListing.slug,
        allowPastomatas: newListing.allowPastomatas,
        isAiTwinActive: newListing.isAiTwinActive,
      });

      setListings((prev) => [published, ...prev.filter((l) => l.id !== published.id)]);
      setLastPublishedListing(published);
      setSellerStep("published");
      if (published.requiresReview) {
        showToast(
          "Skelbimas išsaugotas — moderatorius peržiūrės per 24 val. Kol kas jis nerodomas viešai.",
          "info"
        );
      }

      await refreshListingsCatalog();
      scheduleSellerEngagementPush(published.id, published.location, published.title, {
        pendingReview: Boolean(published.requiresReview),
      });
      // Hero S4: subscribe Web Push from publish gesture so buyer messages reach the seller.
      void registerPushNotifications([]);
      {
        const hero = completeHeroListingFlow({
          listingId: published.id,
          pendingReview: Boolean(published.requiresReview),
        });
        trackEvent("kpi_listing_published", {
          listingId: published.id,
          pendingReview: Boolean(published.requiresReview),
          durationMs: hero.time_to_publish_ms,
          time_to_publish_ms: hero.time_to_publish_ms,
        });
      }
      scheduleListingSocialPublish(published, listingSocialPublish, (result) => {
        if (result.facebook === "opened") {
          showToast("Facebook dalijimasis inicijuotas.", "info");
        }
        if (result.anonser === "queued") {
          showToast("Partnerių srautų sinchronizacija suplanuota.", "info");
        }
      });
      if (!opts?.skipSuccessNotify) {
        notifyListingPublishComplete(publishCategory, 1);
      }
      removeMultiListingDraft(clientDraftId);
      const visibilityCheckout = buildPrePublishVisibilityCheckout(
        published.id,
        published.title,
        selectedVisibility
      );
      return { ok: true, listing: published, visibilityCheckout };
    }

    setListings((prev) => [newListing, ...prev]);
    setLastPublishedListing(newListing);
    setSellerStep("published");
    removeMultiListingDraft(clientDraftId);
    if (newListing.requiresReview) {
      showToast(
        "Skelbimas išsaugotas — moderatorius peržiūrės per 24 val. Kol kas jis nerodomas viešai.",
        "info"
      );
    }
    scheduleSellerEngagementPush(newListing.id, newListing.location, newListing.title, {
      pendingReview: Boolean(newListing.requiresReview),
    });
    // Hero S4: subscribe Web Push from publish gesture so buyer messages reach the seller.
    void registerPushNotifications([]);
    {
      const hero = completeHeroListingFlow({
        listingId: newListing.id,
        pendingReview: Boolean(newListing.requiresReview),
      });
      trackEvent("kpi_listing_published", {
        listingId: newListing.id,
        pendingReview: Boolean(newListing.requiresReview),
        durationMs: hero.time_to_publish_ms,
        time_to_publish_ms: hero.time_to_publish_ms,
      });
    }
    scheduleListingSocialPublish(newListing, listingSocialPublish, (result) => {
      if (result.facebook === "opened") {
        showToast("Facebook dalijimasis inicijuotas.", "info");
      }
      if (result.anonser === "queued") {
        showToast("Partnerių srautų sinchronizacija suplanuota.", "info");
      }
    });
    if (!opts?.skipSuccessNotify) {
      notifyListingPublishComplete(publishCategory, 1);
    }
    const visibilityCheckout = buildPrePublishVisibilityCheckout(
      newListing.id,
      newListing.title,
      selectedVisibility
    );
    return { ok: true, listing: newListing, visibilityCheckout };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = formatPublishSaveError(detail);
      setSellerStep("idle");
      setSyncError(msg);
      showToast(msg, "error");
      pushAgentGreeting(msg, { openSheet: true });
      return { ok: false, error: detail };
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
    refreshListingsCatalog,
    trackEvent,
    logout,
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
      const fallbackCover = await prepareListingImageForApi(
        sellerPreviewImage,
        bulkListingId
      );
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
        const listingCityRaw = resolvePublishListingCity(
          draft.location,
          user.city,
          coords
        );
        const gpsCoords =
          coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
            ? coords
            : null;
        const cityCoords = listingCityRaw
          ? tryGeocodeLocation(listingCityRaw)
          : null;
        const attrCoords = coordsFromListingAttributes(draft.attributes);
        const listingCoords = gpsCoords ?? cityCoords ?? attrCoords ?? null;
        if (!listingCityRaw && !listingCoords) continue;
        const listingCity =
          listingCityRaw ||
          (gpsCoords && isCoordsInLithuania(gpsCoords)
            ? nearestLtCityFromCoords(gpsCoords)
            : "") ||
          UNKNOWN_LISTING_LOCATION_LABEL;
        let distKm = 0.5;
        if (gpsCoords && listingCoords) {
          const exact = distanceToListing(gpsCoords, {
            latitude: listingCoords.lat,
            longitude: listingCoords.lng,
            location: listingCity,
          });
          if (exact !== null) distKm = exact;
        }

        const draftCoverSrc =
          draft.orderedImageUrls?.find((u) => hasListingPhoto(u)) ??
          sellerPreviewImage;
        const listingImage =
          (draftCoverSrc
            ? await prepareListingImageForApi(
                draftCoverSrc,
                `bulk-${Date.now()}-${published}`
              )
            : null) ?? fallbackCover;
        if (!listingImage) {
          continue;
        }

        const createdAt = new Date().toISOString();
        const newListing: Listing = enrichListingWithConductorMeta(
          enrichListingCoords({
          id: `l-${Date.now()}-${published}`,
          title: draft.title,
          price: draft.price,
          priceLabel: draft.priceLabel,
          location: listingCity,
          ...(listingCoords
            ? { latitude: listingCoords.lat, longitude: listingCoords.lng }
            : {}),
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

  const closeEditListingModal = useCallback(() => {
    if (editModalSaving) return;
    setEditModalListing(null);
  }, [editModalSaving]);

  const saveEditListingFromModal = useCallback(
    async (id: string, patch: ListingEditPatch) => {
      const existing = listings.find((l) => l.id === id) ?? editModalListing;
      if (!existing || existing.sellerId !== user.id) {
        showToast("Skelbimas nerastas arba neturite teisių.", "error");
        throw new Error("Skelbimas nerastas arba neturite teisių.");
      }
      setEditModalSaving(true);
      try {
        const photosOptional = listingCategoryAllowsPhotoless(
          patch.category ?? existing.category
        );
        // Edit modal gallery is source of truth (string[] thumbs). Do not re-ban
        // seller-kept URLs via documentImageUrls — that emptied preparedImages while
        // the UI still showed "Nuotraukos (N)" and threw PHOTO_REQUIRED.
        const explicitGallery = Array.isArray(patch.images) ? patch.images : null;
        const rawGallery = (
          explicitGallery
            ? filterSessionListingImages(explicitGallery, { documentUrls: [] })
            : filterSessionListingImages(
                collectListingGalleryCandidates({
                  ...existing,
                  ...patch,
                }),
                {
                  attributes: {
                    ...(existing.attributes ?? {}),
                    ...(patch.attributes ?? {}),
                  },
                }
              )
        ).filter((url) => !isListingPlaceholderUrl(url));
        const cappedGallery = capListingGalleryUrls(
          rawGallery,
          patch.category ?? existing.category
        );
        if (!cappedGallery.length && !photosOptional) {
          showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
          throw new Error(LISTING_PHOTO_REQUIRED_MESSAGE);
        }
        // Keep existing HTTPS covers as-is; upload only data:/blob. Failed uploads
        // must not be mislabeled as "Prašome įkelti bent vieną nuotrauką".
        const preparedImages: string[] = [];
        let uploadFailures = 0;
        for (const src of cappedGallery) {
          const trimmed = src.trim();
          if (!trimmed) continue;
          if (/^https?:\/\//i.test(trimmed)) {
            preparedImages.push(trimmed);
            continue;
          }
          const prepared = await prepareListingImageForApi(trimmed, id);
          if (prepared && /^https?:\/\//i.test(prepared)) {
            preparedImages.push(prepared);
          } else {
            uploadFailures += 1;
          }
        }
        if (!preparedImages.length && !photosOptional) {
          const msg =
            uploadFailures > 0 || cappedGallery.length > 0
              ? LISTING_PHOTO_UPLOAD_FAILED_MESSAGE
              : LISTING_PHOTO_REQUIRED_MESSAGE;
          showToast(msg, "error");
          throw new Error(msg);
        }
        const sanitizedAttributes = sanitizeListingAttributesForPersistence({
          ...(existing.attributes ?? {}),
          ...(patch.attributes ?? {}),
          ...(preparedImages.length ? { galleryUrls: preparedImages } : {}),
        });
        // Sanitize drops `_…` keys (and ephemeral Vision dumps). Re-attach
        // existing underscore metadata so edit save does not wipe DB fields
        // the modal intentionally hides from the UI.
        const nextAttributes: Record<string, string | string[] | undefined> = {
          ...sanitizedAttributes,
        };
        for (const [key, value] of Object.entries(existing.attributes ?? {})) {
          if (!key.startsWith("_")) continue;
          if (key in nextAttributes) continue;
          if (value == null) continue;
          nextAttributes[key] = value;
        }
        const updated: Listing = enrichListingCoords({
          ...existing,
          ...patch,
          attributes: nextAttributes,
          images: preparedImages,
          slug: generateListingSlug(
            patch.title ?? existing.title,
            patch.location ?? existing.location
          ),
        });
        setListings((prev) => prev.map((l) => (l.id === id ? updated : l)));
        if (isDataApiEnabled()) {
          const res = await apiUpdateListing(id, user.id, {
            ...patch,
            images: preparedImages,
            attributes: nextAttributes,
          });
          if (!res.ok) {
            const msg = formatPublishSaveError(res.error);
            setSyncError(msg);
            showToast(msg, "error");
            throw new Error(parseApiErrorMessage(res.error) || msg);
          }
          if (res.data) {
            const fromApi = res.data;
            setListings((prev) =>
              prev.map((l) =>
                l.id === id
                  ? {
                      ...updated,
                      ...fromApi,
                      images:
                        fromApi.images?.length > 0
                          ? fromApi.images
                          : updated.images,
                    }
                  : l
              )
            );
          }
        }
        showToast("Skelbimas atnaujintas!", "success");
        setEditModalListing(null);
        void refreshListingsCatalog();
      } finally {
        setEditModalSaving(false);
      }
    },
    [
      listings,
      editModalListing,
      user.id,
      showToast,
      setListings,
      setSyncError,
      refreshListingsCatalog,
    ]
  );

  const startEditListingFlow = useCallback(
    (listing: Listing, options?: { stayOnPage?: boolean }) => {
      void options;
      if (listing.sellerId !== user.id) {
        showToast("Neturite teisių redaguoti šio skelbimo.", "error");
        return;
      }
      // Prefer catalog copy so gallery/attrs are current; stay on current page.
      const fresh = listings.find((l) => l.id === listing.id) ?? listing;
      clearListingEditSession();
      setEditModalListing(fresh);
    },
    [user.id, showToast, listings]
  );

  const updateSellerMedia = useCallback(
    (patch: {
      imageDataUrl?: string | null;
      imageDataUrls?: string[];
      videoUrl?: string;
    }) => {
      if (patch.imageDataUrls !== undefined) {
        const gallery = patch.imageDataUrls
          .map((u) => String(u ?? "").trim())
          .filter(Boolean);
        setSellerPreviewImages(gallery);
        setSellerPreviewImage(gallery[0] ?? null);
      } else if (patch.imageDataUrl !== undefined) {
        setSellerPreviewImage(patch.imageDataUrl);
        if (patch.imageDataUrl) {
          setSellerPreviewImages((prev) => {
            const next = [patch.imageDataUrl!, ...prev.filter((u) => u !== patch.imageDataUrl)];
            return next.slice(0, 8);
          });
        } else {
          setSellerPreviewImages([]);
        }
      }
      if (patch.videoUrl !== undefined) {
        setSellerVideoUrl(patch.videoUrl);
        const vid = parseVideoUrl(patch.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (patch.imageDataUrl === undefined && patch.imageDataUrls === undefined) {
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
    if (!requireAuthForListing("/")) return;
    // AI seller chat lives on home — legacy /add shell is deprecated.
    router.push("/");
  }, [requireAuthForListing, router]);

  const startVoiceFlow = useCallback(() => {
    if (!requireAuthForListing("/")) return;
    router.push("/");
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
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
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
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
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
      <EditListingModal
        listing={editModalListing}
        saving={editModalSaving}
        onClose={closeEditListingModal}
        onSave={saveEditListingFromModal}
      />
    </SellerFlowContext.Provider>
  );
}

export function useSellerFlow(): SellerFlowContextValue {
  const ctx = useContext(SellerFlowContext);
  if (!ctx) throw new Error("useSellerFlow must be used within SellerFlowContextProvider");
  return ctx;
}

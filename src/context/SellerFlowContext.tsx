"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { useVautoBridge } from "@/context/VautoBridge";
import {
  extractCombined,
  extractFromImage,
  extractFromText,
  extractFromVoice,
} from "@/lib/client-api";
import { isDuplicateListing } from "@/lib/dedup";
import { moderateListing } from "@/lib/moderation";
import { capturePhoto, compressDataUrl, resolveImageForUpload } from "@/lib/native-media";
import { distanceToCity, getUserCoords } from "@/lib/geolocation";
import { distanceToListing, enrichListingCoords, geocodeLocation } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceProvider, verifyVin } from "@/lib/trust";
import { apiCreateListing, apiUpdateListing, apiUpdateUser, apiUploadMedia } from "@/lib/api/client";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";
import { draftToListingPatch, listingToDraft } from "@/lib/listing-edit";
import { importListingFromUrl as fetchListingFromPortal } from "@/lib/listing-url-import";
import { resolveListingCity } from "@/lib/city-resolve";
import { hasListingPhoto, LISTING_PHOTO_REQUIRED_MESSAGE } from "@/lib/listing-form-validation";
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
  formatVintedCategory,
  looksLikeClothingListing,
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
  readSocialPublishFromAttributes,
  type ListingSocialPublishOptions,
} from "@/lib/listing-social-publish";
import { runListingSocialPublish } from "@/lib/listing-social-sync";
import { listingToAdaptiveKey, getMissingCriticalFields } from "@/lib/adaptive-categories";
import { notifyAgentError } from "@/lib/vauto-agent-client";
import { adaptiveKeyToTheme } from "@/lib/chameleon-themes";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { buildPartialListingVoicePromptFromDraft } from "@/lib/voice-listing-context";
import { BUDDY_REPEAT_PROMPT, isUnclearTranscript } from "@/lib/voice-graceful";
import type {
  AiExtractedListing,
  Listing,
  SellerFlowStep,
  SellerInputMode,
} from "@/lib/types";

const PLACEHOLDER_IMAGES: Record<string, string> = {
  electronics:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&h=400&fit=crop",
  services:
    "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=600&h=400&fit=crop",
  vehicles:
    "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=600&h=400&fit=crop",
  home: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=400&fit=crop",
  clothing:
    "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&h=400&fit=crop",
  real_estate:
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=400&fit=crop",
  jobs:
    "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&h=400&fit=crop",
  other:
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=400&fit=crop",
};

async function prepareListingImageForApi(src: string | null | undefined): Promise<string | null> {
  if (!src?.trim()) return null;
  let image = (await resolveImageForUpload(src)) ?? src.trim();
  if (image.startsWith("data:image")) {
    image = await compressDataUrl(image);
    const cloudUrl = await apiUploadMedia(image);
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
  publishListing: () => void;
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
  applyAgentListingDraft: (draft: AiExtractedListing, imageUrl?: string) => void;
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
}

const SellerFlowContext = createContext<SellerFlowContextValue | null>(null);

export function SellerFlowContextProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, authHydrated, openAuthModal, requireAuthForListing } = useAuth();
  const {
    listings,
    setListings,
    buyerCoords,
    setSyncError,
    showToast,
    showConfirm,
    requestMediaConsent,
    scheduleSellerEngagementPush,
    setDetectedAdaptiveKey,
    setChameleonTheme,
  } = useVautoBridge();

  const [sellerStep, setSellerStep] = useState<SellerFlowStep>("idle");
  const [sellerInputMode, setSellerInputMode] = useState<SellerInputMode>(null);
  const [sellerUserPrompt, setSellerUserPrompt] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<AiExtractedListing | null>(null);
  const [aiManualFallback, setAiManualFallback] = useState(false);
  const [sellerPreviewImage, setSellerPreviewImage] = useState<string | null>(null);
  const [sellerVideoUrl, setSellerVideoUrl] = useState("");
  const [sellerHasVideo, setSellerHasVideo] = useState(false);
  const [pendingSellerQuery, setPendingSellerQuery] = useState<string | null>(null);
  const [lastPublishedListing, setLastPublishedListing] = useState<Listing | null>(null);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [listingSocialPublish, setListingSocialPublish] =
    useState<ListingSocialPublishOptions>(DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS);

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
    setSellerVideoUrl("");
    setSellerHasVideo(false);
    setLastPublishedListing(null);
    setEditingListingId(null);
    setListingSocialPublish(DEFAULT_LISTING_SOCIAL_PUBLISH_OPTIONS);
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
      setAiManualFallback(true);
      setAiDraft(
        createManualFallbackDraft({
          location: user.city,
          contact: user.phone,
        })
      );
      if (opts?.previewImage) {
        setSellerPreviewImage(opts.previewImage);
      }
      if (opts?.inputMode) {
        setSellerInputMode(opts.inputMode);
      } else {
        setSellerInputMode((prev) => prev ?? "upload");
      }
      setSellerStep("confirmation");
      showToast(
        opts?.toastMessage ?? VISION_RECOGNITION_FAILED_MESSAGE,
        "info"
      );
    },
    [user.city, user.phone, showToast]
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
      }
    ) => {
      const started = performance.now();
      setSellerStep("processing");
      setAiManualFallback(false);

      const promptText =
        opts?.transcript?.trim() ||
        (mode === "upload" ? "Įkelta nuotrauka — analizuoju…" : null);
      if (promptText) setSellerUserPrompt(promptText);

      logAiSafeguard("processing_start", { mode, hasImage: Boolean(opts?.previewImage) });

      const enterManualFallback = (reason: string, error?: unknown) => {
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
        const coordsPromise = getUserCoords();
        const locationHintPromise = coordsPromise.then((coords) => {
          if (!coords) return user.city;
          const d = distanceToCity(coords, user.city);
          return d !== null && d < 50 ? user.city : user.city;
        });

        const extractPromise = locationHintPromise.then((locationHint) => {
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
          if (mode === "text") return extractFromText(ctx);
          return extractFromVoice(ctx);
        });

        const [locationHint, extracted] = await Promise.all([
          locationHintPromise,
          withAiTimeout(extractPromise, undefined, `extract_${mode ?? "unknown"}`),
        ]);

        if (!isValidAiExtracted(extracted)) {
          enterManualFallback("invalid_extraction");
          return;
        }

        let next = extracted;
        if (!next.location && locationHint) {
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
        } else if (looksLikeVehicle) {
          next = enrichVehicleListingDraft(next, [textForHeuristics]);
        } else {
          const title = next.title ?? "";
          if (looksLikeClothingListing(title, next.category)) {
            const attrs = { ...(next.attributes ?? {}) };
            const group = detectClothingGroupFromText(title) ?? "Moterims";
            const sub = detectSubcategoryFromText(title, group) ?? "Kita";
            if (!attrs.vintedCategory) {
              attrs.vintedCategory = formatVintedCategory(group, sub);
            }
            if (!attrs.brand) {
              const brand = detectBrandFromText(title);
              if (brand) attrs.brand = brand;
            }
            if (!attrs.size) {
              const size = detectSizeFromText(title);
              if (size) attrs.size = size;
            }
            if (!attrs.condition) attrs.condition = "Gera";
            next = { ...next, category: "clothing", attributes: attrs };
          } else if (looksLikeServiceListing(title, next.category)) {
            const attrs = { ...(next.attributes ?? {}) };
            if (!attrs.serviceSpecialty) {
              const specialty = detectServiceSpecialty(title);
              if (specialty) attrs.serviceSpecialty = specialty;
            }
            if (!attrs.serviceRadius) attrs.serviceRadius = "25 km";
            if (!attrs.experience) attrs.experience = "5+ metai";
            const serviceList = attrs.serviceList;
            const hasServices = Array.isArray(serviceList)
              ? serviceList.length > 0
              : Boolean(serviceList);
            if (!hasServices) attrs.serviceList = ["Remontas", "Montavimas"];
            if (!next.price || next.price <= 0) next = { ...next, price: 30 };
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

        setAiDraft(next);
        setSellerStep("confirmation");

        const voicePrompt = buildPartialListingVoicePromptFromDraft(next);
        if (voicePrompt && (mode === "voice" || opts?.transcript?.trim())) {
          speakBuddyMessage(voicePrompt, { enabled: true });
        }

        logAiSafeguard("processing_success", {
          mode,
          elapsedMs: Math.round(performance.now() - started),
          category: next.category,
          confidence: next.confidence,
        });
      } catch (error) {
        if (error instanceof AiSafeguardError) {
          enterManualFallback(error.code, error);
          return;
        }
        enterManualFallback("unexpected_error", error);
      }
    },
    [user.city, user.phone, user.email, openManualListingWizard, sellerPreviewImage]
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

      const primaryImage =
        payload.imageDataUrl ??
        payload.imageDataUrls?.[0] ??
        parseVideoUrl(payload.videoUrl ?? "").thumbnail;

      if (primaryImage) setSellerPreviewImage(primaryImage);
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

  const applyAgentListingDraft = useCallback(
    (draft: AiExtractedListing, imageUrl?: string) => {
      if (!requireAuthForListing("/add")) return;
      setAiManualFallback(false);
      const enriched = enrichVehicleListingDraft(draft, [
        draft.title,
        draft.description ?? "",
      ]);
      setAiDraft(enriched);
      setSellerInputMode("text");
      setSellerUserPrompt(enriched.description ?? enriched.title);
      if (imageUrl) setSellerPreviewImage(imageUrl);
      const key = listingToAdaptiveKey(enriched.category);
      setChameleonTheme(adaptiveKeyToTheme(key));
      setSellerStep("confirmation");
      const vehicleAttrs = enriched.attributes;
      const prefilled =
        enriched.category === "vehicles" &&
        vehicleAttrs?.make &&
        vehicleAttrs?.model &&
        vehicleAttrs?.year;
      showToast(
        prefilled
          ? `AI užpildė ${vehicleAttrs.make} ${vehicleAttrs.model} ${vehicleAttrs.year} — patvirtinkite arba pataisykite.`
          : "AI paruošė skelbimą — patvirtinkite arba pataisykite.",
        "success"
      );
      const voicePrompt = buildPartialListingVoicePromptFromDraft(enriched);
      if (voicePrompt) {
        speakBuddyMessage(voicePrompt, { enabled: true });
      }
    },
    [requireAuthForListing, setChameleonTheme, showToast]
  );

  const importListingFromUrl = useCallback(
    async (url: string) => {
      if (!requireAuthForListing("/add")) return;
      setSellerStep("processing");
      setAiManualFallback(false);
      try {
        const draft = await fetchListingFromPortal(url, {
          userCity: user.city || "Lietuva",
          contact: user.phone,
        });
        applyAgentListingDraft(draft);
        showToast(
          "Skelbimas importuotas — peržiūrėkite ir publikuokite visoje Lietuvoje",
          "success"
        );
      } catch (e) {
        setSellerStep("idle");
        showToast(
          e instanceof Error ? e.message : "Nepavyko importuoti skelbimo",
          "error"
        );
      }
    },
    [
      applyAgentListingDraft,
      requireAuthForListing,
      showToast,
      user.city,
      user.phone,
    ]
  );

  const startListingFromQuery = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !detectSellerListingIntent(trimmed)) return false;
      if (!requireAuthForListing("/add")) {
        setPendingSellerQuery(trimmed);
        return true;
      }
      void submitSellerContent({ text: trimmed });
      return true;
    },
    [requireAuthForListing, submitSellerContent]
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
        speakBuddyMessage(BUDDY_REPEAT_PROMPT, { enabled: true });
        setSellerStep("recording");
        return;
      }
      void runAiProcessing("voice", { transcript: cleaned });
    },
    [runAiProcessing]
  );

  const cancelVoiceRecording = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const updateAiDraft = useCallback((patch: Partial<AiExtractedListing>) => {
    setAiDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      if (patch.attributes) {
        next.attributes = { ...(prev.attributes ?? {}), ...patch.attributes };
      }
      return next;
    });
  }, []);

  const publishListing = useCallback(async () => {
    if (!aiDraft) {
      showToast("Klaida: nėra skelbimo duomenų. Bandykite iš naujo.", "error");
      return;
    }
    if (!authHydrated) {
      showToast("Palaukite — kraunama paskyra…", "info");
      return;
    }
    if (!isAuthenticated) {
      openAuthModal("/add");
      return;
    }
    if (!aiDraft.title.trim()) {
      showToast("Įveskite pavadinimą prieš publikuojant.", "error");
      return;
    }
    if (aiDraft.price <= 0) {
      showToast("Įveskite kainą prieš publikuojant.", "error");
      return;
    }

    const adaptiveKey = listingToAdaptiveKey(aiDraft.category);
    const missing = getMissingCriticalFields(adaptiveKey, aiDraft.attributes ?? {}, {
      price: aiDraft.price,
      description: aiDraft.description,
    });
    if (missing.length > 0) {
      showToast(
        `Užpildykite privalomus laukus: ${missing.slice(0, 3).join(", ")}`,
        "error"
      );
      return;
    }

    const priceSanity = evaluatePriceSanity(aiDraft.category, aiDraft.price);
    if (priceSanity.suspicious) {
      const priceDisplay = formatPriceForConfirm(aiDraft.price, aiDraft.priceLabel);
      const confirmed = await showConfirm({
        title: "Patikrinkite kainą",
        message: `AI pastebėjo, kad kaina gali būti klaidinga. Ar tikrai norite skelbti su kaina: ${priceDisplay}?`,
        confirmLabel: "Taip, skelbti",
        cancelLabel: "Grįžti",
      });
      if (!confirmed) return;
    }

    const mod = moderateListing(aiDraft);
    if (!mod.allowed) {
      showToast(mod.reason ?? "Skelbimas atmestas moderacijos.", "error");
      return;
    }

    if (!editingListingId && !hasListingPhoto(sellerPreviewImage)) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }

    if (editingListingId) {
      const existing = listings.find((l) => l.id === editingListingId);
      if (!existing || existing.sellerId !== user.id) {
        showToast("Skelbimas nerastas arba neturite teisių.", "error");
        return;
      }
      const patch = draftToListingPatch(aiDraft);
      const imageSource = sellerPreviewImage ?? existing.images[0] ?? null;
      const listingImage =
        (await prepareListingImageForApi(imageSource)) ??
        existing.images[0] ??
        PLACEHOLDER_IMAGES[aiDraft.category];
      const updated: Listing = enrichListingCoords({
        ...existing,
        ...patch,
        attributes: mergeSocialPublishAttributes(
          { ...(existing.attributes ?? {}), ...(patch.attributes ?? aiDraft.attributes) },
          listingSocialPublish
        ),
        images: listingImage ? [listingImage, ...existing.images.slice(1)] : existing.images,
        slug: generateListingSlug(patch.title ?? existing.title, patch.location ?? existing.location),
        hasVideo: sellerHasVideo,
      });
      setListings((prev) =>
        prev.map((l) => (l.id === editingListingId ? updated : l))
      );
      if (isDataApiEnabled()) {
        const res = await apiUpdateListing(editingListingId, user.id, {
          ...patch,
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

    if (isDuplicateListing(aiDraft.title, user.id, listings)) {
      showToast(
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą.",
        "error"
      );
      return;
    }

    let distKm = 0.5;
    const coords = buyerCoords ?? (await getUserCoords());
    const listingCity = resolveListingCity(aiDraft.location, user.city || "Vilnius");
    const listingCoords = geocodeLocation(listingCity);
    if (coords) {
      const exact = distanceToListing(coords, {
        latitude: listingCoords.lat,
        longitude: listingCoords.lng,
        location: listingCity,
      });
      if (exact !== null) distKm = exact;
    }

    const vin =
      typeof aiDraft.attributes?.vin === "string" ? aiDraft.attributes.vin : undefined;
    const vinOk = vin ? verifyVin(vin) : false;

    const listingImage =
      (await prepareListingImageForApi(sellerPreviewImage)) ?? null;
    if (!listingImage) {
      showToast(LISTING_PHOTO_REQUIRED_MESSAGE, "error");
      return;
    }

    const createdAt = new Date().toISOString();
    const newListing: Listing = enrichListingCoords({
      id: `l-${Date.now()}`,
      title: aiDraft.title,
      price: aiDraft.price,
      priceLabel: aiDraft.priceLabel,
      location: listingCity,
      distanceKm: distKm,
      slug: generateListingSlug(aiDraft.title, listingCity),
      images: [listingImage],
      category: aiDraft.category,
      tags: attributesToTags(aiDraft),
      description: aiDraft.description,
      attributes: mergeSocialPublishAttributes(aiDraft.attributes, listingSocialPublish),
      status: "active",
      sellerId: user.id,
      createdAt,
      expiresAt: defaultExpiresAt(createdAt),
      contact: aiDraft.contact,
      hasVideo: sellerHasVideo,
      vinVerified: vinOk,
      providerVerified:
        aiDraft.category === "services" && isVerifiedServiceProvider(user),
    });

    let published = newListing;
    if (isDataApiEnabled()) {
      const userRes = await apiUpdateUser({
        ...user,
        avatar: sanitizeAvatarForApi(user.avatar),
      });
      if (!userRes.ok) {
        const msg = `Profilis neišsaugotas: ${userRes.error}`;
        setSyncError(msg);
        showToast(msg, "error");
        return;
      }
      const createRes = await apiCreateListing(newListing, user.id);
      if (!createRes.ok) {
        const msg = `Nepavyko publikuoti: ${createRes.error}`;
        setSyncError(msg);
        showToast(msg, "error");
        return;
      }
      published = withDefaultExpiry({
        ...createRes.data,
        slug: createRes.data.slug ?? newListing.slug,
      });
    }

    showToast("Skelbimas sėkmingai įkeltas!", "success");
    setListings((prev) => [published, ...prev]);
    setLastPublishedListing(published);
    setSellerStep("published");
    scheduleSellerEngagementPush(published.id, published.location, published.title);
    void runListingSocialPublish(published, listingSocialPublish).then((result) => {
      if (result.facebook === "opened") {
        showToast("Facebook dalijimasis inicijuotas.", "info");
      }
      if (result.anonser === "queued") {
        showToast("Anonser.lt sinchronizacija suplanuota.", "info");
      }
    });
  }, [
    aiDraft,
    sellerPreviewImage,
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
  ]);

  const startEditListingFlow = useCallback(
    (listing: Listing) => {
      if (listing.sellerId !== user.id) {
        showToast("Neturite teisių redaguoti šio skelbimo.", "error");
        return;
      }
      setEditingListingId(listing.id);
      setAiDraft(listingToDraft(listing));
      setSellerPreviewImage(listing.images[0] ?? null);
      setSellerVideoUrl("");
      setSellerHasVideo(Boolean(listing.hasVideo));
      setAiManualFallback(true);
      setSellerInputMode("upload");
      setListingSocialPublish(readSocialPublishFromAttributes(listing.attributes));
      setSellerStep("confirmation");
    },
    [user.id, showToast]
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
    if (!requireAuthForListing("/add")) return;
    requestMediaConsent(async () => {
      const photo = await capturePhoto("prompt");
      if (!photo) return;
      setSellerPreviewImage(photo.dataUrl);
      setSellerInputMode("upload");
      await runAiProcessing("upload", { previewImage: photo.dataUrl });
    });
  }, [requireAuthForListing, runAiProcessing, requestMediaConsent]);

  const startVoiceFlow = useCallback(() => {
    if (!requireAuthForListing("/add")) return;
    requestMediaConsent(() => {
      setSellerInputMode("voice");
      setSellerStep("recording");
    });
  }, [requireAuthForListing, requestMediaConsent]);

  const cancelSellerFlow = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  useEffect(() => {
    if (
      aiDraft &&
      (sellerStep === "confirmation" ||
        sellerStep === "processing" ||
        sellerStep === "published")
    ) {
      const key = listingToAdaptiveKey(aiDraft.category);
      setDetectedAdaptiveKey(key);
      setChameleonTheme(adaptiveKeyToTheme(key));
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
      sellerVideoUrl,
      updateSellerMedia,
      startUploadFlow,
      startVoiceFlow,
      completeVoiceRecording,
      cancelVoiceRecording,
      updateAiDraft,
      publishListing,
      cancelSellerFlow,
      lastPublishedListing,
      finishPublishedFlow,
      submitSellerContent,
      applyAgentListingDraft,
      importListingFromUrl,
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
      openManualListingWizard,
      startEditListingFlow,
      listingSocialPublish,
      updateListingSocialPublish,
    }),
    [
      sellerStep,
      sellerInputMode,
      sellerUserPrompt,
      aiDraft,
      aiManualFallback,
      sellerPreviewImage,
      sellerVideoUrl,
      updateSellerMedia,
      startUploadFlow,
      startVoiceFlow,
      completeVoiceRecording,
      cancelVoiceRecording,
      updateAiDraft,
      publishListing,
      cancelSellerFlow,
      lastPublishedListing,
      finishPublishedFlow,
      submitSellerContent,
      applyAgentListingDraft,
      importListingFromUrl,
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
      openManualListingWizard,
      startEditListingFlow,
      listingSocialPublish,
      updateListingSocialPublish,
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

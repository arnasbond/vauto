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
import { capturePhoto, compressDataUrl } from "@/lib/native-media";
import { distanceToCity, getUserCoords } from "@/lib/geolocation";
import { distanceToListing, enrichListingCoords, geocodeLocation } from "@/lib/geocoding";
import { generateListingSlug } from "@/lib/seo";
import { isVerifiedServiceProvider, verifyVin } from "@/lib/trust";
import { apiCreateListing, apiUpdateUser, apiUploadMedia } from "@/lib/api/client";
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
  withAiTimeout,
} from "@/lib/ai-safeguards";
import { detectSellerListingIntent } from "@/lib/scoring";
import { detectVehicleMake } from "@/lib/vehicle-keywords";
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
import { runAutoShareOnPublish } from "@/lib/social-sync";
import { listingToAdaptiveKey, getMissingCriticalFields } from "@/lib/adaptive-categories";
import { adaptiveKeyToTheme } from "@/lib/chameleon-themes";
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
  startListingFromQuery: (text: string) => boolean;
  pendingSellerQuery: string | null;
  consumePendingSellerQuery: () => string | null;
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
  }, []);

  const finishPublishedFlow = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

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
        showToast(MANUAL_FALLBACK_TOAST, "info");
        setAiManualFallback(true);
        setAiDraft(
          createManualFallbackDraft({
            location: user.city,
            contact: user.phone,
          })
        );
        setSellerStep("confirmation");
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

        const title = next.title ?? "";
        const detectedMake = detectVehicleMake(title);
        const looksLikeVehicle =
          next.category === "vehicles" ||
          Boolean(detectedMake) ||
          Boolean(next.attributes?.make) ||
          /\b(vin|automobili|mašin|kebulo|varikli)\b/i.test(title);

        if (looksLikeVehicle) {
          const attrs = { ...(next.attributes ?? {}) };
          if (!attrs.make && detectedMake) attrs.make = detectedMake;
          const yearMatch = title.match(/\b(19|20)\d{2}\b/);
          if (!attrs.year && yearMatch) attrs.year = yearMatch[0];
          const modelMatch = title.match(
            /\b(C[1-5]|DS[3-7]|Golf|Passat|A[346]|320|520|Corolla|Focus)\b/i
          );
          if (!attrs.model && modelMatch) attrs.model = modelMatch[0];
          if (!attrs.defects) attrs.defects = "Be defektų";
          if (!attrs.steering) attrs.steering = "Kairėje";
          next = { ...next, category: "vehicles", attributes: attrs };
        } else {
          const detectedProperty = detectPropertyTypeFromText(title);
          const looksLikeRealEstate =
            next.category === "real_estate" ||
            Boolean(detectedProperty) ||
            Boolean(next.attributes?.propertyType) ||
            /\b(butas|namas|sklypas|nuomoju|kambar|kv\.?m|aukštas|nt\b|nekilnojam|patalp|garaž)/i.test(title);

          if (looksLikeRealEstate) {
            const attrs = { ...(next.attributes ?? {}) };
            const propertyType =
              (attrs.propertyType as string) || detectedProperty || "butas";
            if (!attrs.propertyType) attrs.propertyType = propertyType;
            if (!attrs.transactionType) {
              attrs.transactionType =
                detectTransactionFromText(title) ??
                defaultTransactionForType(propertyType);
            }
            const roomsMatch = title.match(/(\d+)\s*kamb/i);
            if (!attrs.rooms && roomsMatch) attrs.rooms = roomsMatch[1];
            const areaMatch = title.match(/(\d+(?:[.,]\d+)?)\s*(?:kv\.?m|m²|m2)/i);
            if (!attrs.area && areaMatch) attrs.area = areaMatch[1].replace(",", ".");
            if (!attrs.sellerRole) attrs.sellerRole = "Privatus asmuo";
            next = { ...next, category: "real_estate", attributes: attrs };
          } else if (looksLikeClothingListing(title, next.category)) {
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
    [user.city, user.phone, user.email, showToast]
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
      setAiDraft(draft);
      setSellerInputMode("text");
      setSellerUserPrompt(draft.description ?? draft.title);
      if (imageUrl) setSellerPreviewImage(imageUrl);
      const key = listingToAdaptiveKey(draft.category);
      setChameleonTheme(adaptiveKeyToTheme(key));
      setSellerStep("confirmation");
      showToast("AI paruošė skelbimą — patvirtinkite arba pataisykite.", "success");
    },
    [requireAuthForListing, setChameleonTheme, showToast]
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
      if (!transcript) {
        resetSellerFlow();
        return;
      }
      void runAiProcessing("voice", { transcript });
    },
    [runAiProcessing, resetSellerFlow]
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
    if (!aiDraft) return;
    if (!authHydrated) return;
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

    if (isDuplicateListing(aiDraft.title, user.id, listings)) {
      showToast(
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą.",
        "error"
      );
      return;
    }

    let distKm = 0.5;
    const coords = buyerCoords ?? (await getUserCoords());
    const listingCoords = geocodeLocation(aiDraft.location);
    if (coords) {
      const exact = distanceToListing(coords, {
        latitude: listingCoords.lat,
        longitude: listingCoords.lng,
        location: aiDraft.location,
      });
      if (exact !== null) distKm = exact;
    }

    const vin =
      typeof aiDraft.attributes?.vin === "string" ? aiDraft.attributes.vin : undefined;
    const vinOk = vin ? verifyVin(vin) : false;

    let listingImage =
      sellerPreviewImage ??
      PLACEHOLDER_IMAGES[aiDraft.category] ??
      PLACEHOLDER_IMAGES.other;
    if (listingImage.startsWith("data:image")) {
      listingImage = await compressDataUrl(listingImage);
      const cloudUrl = await apiUploadMedia(listingImage);
      if (cloudUrl) listingImage = cloudUrl;
    }

    const createdAt = new Date().toISOString();
    const newListing: Listing = enrichListingCoords({
      id: `l-${Date.now()}`,
      title: aiDraft.title,
      price: aiDraft.price,
      priceLabel: aiDraft.priceLabel,
      location: aiDraft.location,
      distanceKm: distKm,
      slug: generateListingSlug(aiDraft.title, aiDraft.location),
      image: listingImage,
      category: aiDraft.category,
      tags: attributesToTags(aiDraft),
      description: aiDraft.description,
      attributes: aiDraft.attributes,
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
      const userRes = await apiUpdateUser(user);
      if (!userRes.ok) {
        setSyncError(`Profilis neišsaugotas: ${userRes.error}`);
        return;
      }
      const createRes = await apiCreateListing(newListing, user.id);
      if (!createRes.ok) {
        setSyncError(`Nepavyko publikuoti: ${createRes.error}`);
        return;
      }
      published = withDefaultExpiry(createRes.data);
    }

    showToast("Skelbimas publikuotas!", "success");
    setListings((prev) => [published, ...prev]);
    setLastPublishedListing(published);
    setSellerStep("published");
    scheduleSellerEngagementPush(published.id, published.location, published.title);
    void runAutoShareOnPublish(published).then((result) => {
      if (result.method === "native") {
        showToast("Skelbimas pasidalintas per sisteminį dalijimosi meniu.", "success");
      } else if (result.method === "platform" && result.platform) {
        showToast(`Atidarytas ${result.platform} dalijimosi langas.`, "info");
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
  ]);

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
      const photo = await capturePhoto();
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
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
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
      startListingFromQuery,
      pendingSellerQuery,
      consumePendingSellerQuery,
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

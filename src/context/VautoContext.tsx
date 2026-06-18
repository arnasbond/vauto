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
import {
  INITIAL_CHATS,
  INITIAL_LISTINGS,
  MOCK_USER,
} from "@/data/mockListings";
import {
  detectPurchaseIntent,
  generateDynamicFilters,
  rankListings,
  resolveSortMode,
} from "@/lib/scoring";
import {
  extractCombined,
  extractFromImage,
  extractFromText,
  extractFromVoice,
} from "@/lib/client-api";
import { isDuplicateListing } from "@/lib/dedup";
import { moderateListing } from "@/lib/moderation";
import {
  loadAuthSession,
  loadBannedUserIds,
  loadChats,
  loadGdprConsent,
  loadListings,
  loadReports,
  loadSavedIds,
  loadUser,
  saveAuthSession,
  saveBannedUserIds,
  saveChats,
  saveGdprConsent,
  saveListings,
  saveReports,
  saveSavedIds,
  saveUser,
  clearAuthSession,
} from "@/lib/storage";
import { capturePhoto } from "@/lib/native-media";
import { distanceToCity, getUserCoords, type UserCoords } from "@/lib/geolocation";
import {
  distanceToListing,
  enrichListingCoords,
  geocodeLocation,
} from "@/lib/geocoding";
import { normalizeListings } from "@/lib/listing-normalize";
import { generateListingSlug } from "@/lib/seo";
import { scheduleSmsFallback } from "@/lib/sms-fallback";
import {
  isVerifiedServiceSeller,
  verifyVin,
} from "@/lib/trust";
import {
  apiCreateListing,
  apiDeleteListing,
  apiFetchChats,
  apiFetchListings,
  apiFetchSaved,
  apiFetchUser,
  apiHealthCheck,
  apiRenewListing,
  apiUpdateListing,
  apiFetchReports,
  apiSubmitReport,
  apiUpdateReportStatus,
  apiFetchBannedUsers,
  apiSetBannedUsers,
  apiWarnUser,
  apiUpdateSaved,
  apiUpdateUser,
  apiUpsertChat,
  apiUpsertEscrow,
} from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import { defaultExpiresAt, withDefaultExpiry } from "@/lib/listing-expiry";
import { attributesToTags } from "@/lib/listing-attributes";
import { parseVideoUrl } from "@/lib/video-url";
import type {
  AiExtractedListing,
  AuthProvider,
  ChatMessage,
  ChatThread,
  EscrowTransaction,
  Listing,
  ProBusinessType,
  ReportCategory,
  ReportStatus,
  SellerFlowStep,
  SellerInputMode,
  SupportReport,
  UserProfile,
  UserRole,
} from "@/lib/types";
import { mockListingMetrics } from "@/lib/dashboard-mock";
import { ADMIN_EMAIL, categoryToUrgency } from "@/lib/reports";
import { DEMO_REPORTS } from "@/data/mockReports";
import { GdprConsentModal } from "@/components/privacy/GdprConsentModal";

interface VautoContextValue {
  user: UserProfile;
  updateUser: (patch: Partial<UserProfile>) => void;
  listings: Listing[];
  savedIds: Set<string>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilterIds: Set<string>;
  toggleFilter: (id: string) => void;
  rankedListings: ReturnType<typeof rankListings>;
  dynamicFilters: ReturnType<typeof generateDynamicFilters>;
  toggleSave: (id: string) => void;
  deleteListing: (id: string) => void;
  renewListing: (id: string) => Promise<void>;

  syncError: string | null;
  clearSyncError: () => void;

  sellerStep: SellerFlowStep;
  sellerInputMode: SellerInputMode;
  aiDraft: AiExtractedListing | null;
  sellerPreviewImage: string | null;
  startUploadFlow: () => Promise<void>;
  startVoiceFlow: () => void;
  completeVoiceRecording: (transcript: string | null) => void;
  cancelVoiceRecording: () => void;
  updateAiDraft: (patch: Partial<AiExtractedListing>) => void;
  publishListing: () => void;
  cancelSellerFlow: () => void;
  submitSellerContent: (payload: {
    text?: string;
    imageDataUrl?: string | null;
    videoUrl?: string;
  }) => Promise<void>;

  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
  updateEscrow: (chatId: string, escrow: EscrowTransaction) => void;

  isAuthenticated: boolean;
  login: (data: {
    provider: AuthProvider;
    phone?: string;
    role: UserRole;
    businessType?: ProBusinessType;
    email?: string;
  }) => void;
  logout: () => void;
  topUpWallet: (amount: number) => void;
  promoteListing: (listingId: string, cost: number) => boolean;
  updateListing: (
    id: string,
    patch: Partial<Pick<Listing, "title" | "price" | "status">>
  ) => void;
  markListingSold: (id: string) => void;

  isAdmin: boolean;
  reports: SupportReport[];
  bannedUserIds: Set<string>;
  submitReport: (data: {
    category: ReportCategory;
    comment: string;
    listingId?: string;
    listingTitle?: string;
    chatId?: string;
    reportedUserId?: string;
    chatPreview?: string;
  }) => void;
  warnFromReport: (reportId: string) => void;
  banFromReport: (reportId: string) => void;
  resolveReport: (reportId: string, status: ReportStatus) => void;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;

  buyerCoords: UserCoords | null;
  gdprConsent: boolean;
  gdprModalOpen: boolean;
  requestMediaConsent: (onGranted: () => void) => void;
  acceptGdprConsent: () => void;
  declineGdprConsent: () => void;
  revokeGdprConsent: () => void;
  setActiveChatId: (chatId: string | null) => void;
  markChatRead: (chatId: string) => void;
  findListing: (idOrSlug: string) => Listing | undefined;
}

const VautoContext = createContext<VautoContextValue | null>(null);

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
  other:
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=400&fit=crop",
};

function applyBuyerDistances(
  items: Listing[],
  buyer: UserCoords | null
): Listing[] {
  if (!buyer) return items;
  return items.map((l) => {
    const exact = distanceToListing(buyer, l);
    const fallback = distanceToCity(buyer, l.location);
    const km = exact ?? fallback;
    return km !== null ? { ...l, distanceKm: km } : l;
  });
}

export function VautoProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [apiActive, setApiActive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile>(MOCK_USER);
  const [listings, setListings] = useState<Listing[]>(INITIAL_LISTINGS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(["l-bike"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterIds, setActiveFilterIds] = useState<Set<string>>(
    new Set()
  );
  const [chats, setChats] = useState<ChatThread[]>(INITIAL_CHATS);
  const [reports, setReports] = useState<SupportReport[]>(DEMO_REPORTS);
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [buyerCoords, setBuyerCoords] = useState<UserCoords | null>(null);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [gdprModalOpen, setGdprModalOpen] = useState(false);

  const activeChatIdRef = useRef<string | null>(null);
  const smsCancelRef = useRef<Map<string, () => void>>(new Map());
  const gdprPendingAction = useRef<(() => void) | null>(null);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    async function load() {
      if (isDataApiEnabled() && (await apiHealthCheck())) {
        setApiActive(true);
        const storedUser = loadUser();
        const uid = storedUser?.id ?? MOCK_USER.id;
        const [listingsRes, chatsRes, savedRes, userRes, reportsRes, bannedRes] =
          await Promise.all([
          apiFetchListings(),
          apiFetchChats(uid),
          apiFetchSaved(uid),
          apiFetchUser(uid),
          apiFetchReports(),
          apiFetchBannedUsers(),
        ]);

        const errors: string[] = [];
        if (listingsRes.ok) {
          setListings(
            normalizeListings(listingsRes.data.map(withDefaultExpiry))
          );
        } else errors.push(listingsRes.error);
        if (chatsRes.ok) setChats(chatsRes.data);
        else errors.push(chatsRes.error);
        if (savedRes.ok) setSavedIds(new Set(savedRes.data));
        else errors.push(savedRes.error);
        if (userRes.ok) setUser(userRes.data);
        else if (storedUser) setUser(storedUser);
        if (reportsRes.ok && reportsRes.data.length) setReports(reportsRes.data);
        else if (reportsRes.ok) setReports(DEMO_REPORTS);
        if (bannedRes.ok) setBannedUserIds(new Set(bannedRes.data));
        const auth = loadAuthSession();
        if (auth?.isAuthenticated) setIsAuthenticated(true);

        if (errors.length) setSyncError(errors[0]);
        setGdprConsent(loadGdprConsent());
        setHydrated(true);
        return;
      }

      setApiActive(false);
      const storedUser = loadUser();
      const auth = loadAuthSession();
      const storedListings = loadListings();
      const storedChats = loadChats();
      const storedSaved = loadSavedIds();
      const storedReports = loadReports();
      const storedBanned = loadBannedUserIds();
      if (auth?.isAuthenticated) setIsAuthenticated(true);
      if (storedUser) setUser({ role: "private", walletBalance: 0, ...storedUser });
      if (storedListings?.length) {
        setListings(normalizeListings(storedListings));
      }
      if (storedChats?.length) setChats(storedChats);
      if (storedSaved) setSavedIds(new Set(storedSaved));
      if (storedReports?.length) setReports(storedReports);
      else saveReports(DEMO_REPORTS);
      if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      setGdprConsent(loadGdprConsent());
      setHydrated(true);
    }
    void load();
  }, []);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveUser(user);
  }, [user, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveListings(listings);
  }, [listings, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveChats(chats);
  }, [chats, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSavedIds(savedIds);
  }, [savedIds, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveReports(reports);
  }, [reports, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveBannedUserIds(Array.from(bannedUserIds));
  }, [bannedUserIds, hydrated, apiActive]);

  const [sellerStep, setSellerStep] = useState<SellerFlowStep>("idle");
  const [sellerInputMode, setSellerInputMode] =
    useState<SellerInputMode>(null);
  const [aiDraft, setAiDraft] = useState<AiExtractedListing | null>(null);
  const [sellerPreviewImage, setSellerPreviewImage] = useState<string | null>(
    null
  );
  const [sellerHasVideo, setSellerHasVideo] = useState(false);

  useEffect(() => {
    getUserCoords().then((coords) => {
      if (!coords) return;
      setBuyerCoords(coords);
      setListings((prev) => applyBuyerDistances(prev, coords));
    });
  }, []);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const updateUser = useCallback((patch: Partial<UserProfile>) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      if (isDataApiEnabled()) {
        void apiUpdateUser(next).then((r) => {
          if (!r.ok) setSyncError(`Profilis neišsaugotas: ${r.error}`);
        });
      }
      return next;
    });
  }, []);

  const dynamicFilters = useMemo(
    () => generateDynamicFilters(searchQuery),
    [searchQuery]
  );

  const isAdmin = user.role === "admin" || user.email === ADMIN_EMAIL;

  const visibleListings = useMemo(
    () =>
      listings.filter(
        (l) => !l.banned && !bannedUserIds.has(l.sellerId)
      ),
    [listings, bannedUserIds]
  );

  const rankedListings = useMemo(() => {
    let results = rankListings(
      visibleListings,
      searchQuery,
      resolveSortMode(activeFilterIds)
    );

    if (activeFilterIds.size > 0) {
      const activeFilters = dynamicFilters.filter((f) =>
        activeFilterIds.has(f.id)
      );
      const sortOnly = new Set(["newest", "cheapest", "closest", "budget", "cheap-service"]);
      const predicateFilters = activeFilters.filter(
        (f) => !sortOnly.has(f.id)
      );
      if (predicateFilters.length > 0) {
        results = results.filter((l) =>
          predicateFilters.every((f) => f.apply(l))
        );
      }
    }

    return results;
  }, [visibleListings, searchQuery, activeFilterIds, dynamicFilters]);

  const toggleFilter = useCallback((id: string) => {
    setActiveFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (isDataApiEnabled()) {
        void apiUpdateSaved(user.id, Array.from(next)).then((r) => {
          if (!r.ok) setSyncError(`Išsaugota nepavyko: ${r.error}`);
        });
      }
      return next;
    });
  }, [user.id]);

  const deleteListing = useCallback(
    (id: string) => {
      setListings((prev) =>
        prev.filter((l) => !(l.id === id && l.sellerId === user.id))
      );
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (isDataApiEnabled()) {
        void apiDeleteListing(id, user.id).then((r) => {
          if (!r.ok) setSyncError(`Nepavyko ištrinti: ${r.error}`);
        });
      }
    },
    [user.id]
  );

  const renewListing = useCallback(
    async (id: string) => {
      const listing = listings.find((l) => l.id === id && l.sellerId === user.id);
      if (!listing) return;

      const now = new Date().toISOString();
      const renewed = withDefaultExpiry({
        ...listing,
        createdAt: now,
        expiresAt: defaultExpiresAt(now),
      });

      if (isDataApiEnabled()) {
        const r = await apiRenewListing(id, user.id);
        if (!r.ok) {
          setSyncError(`Nepavyko pratęsti: ${r.error}`);
          return;
        }
        setListings((prev) =>
          prev.map((l) => (l.id === id ? withDefaultExpiry(r.data) : l))
        );
        return;
      }

      setListings((prev) =>
        prev.map((l) => (l.id === id ? renewed : l))
      );
    },
    [listings, user.id]
  );

  const resetSellerFlow = useCallback(() => {
    setSellerStep("idle");
    setSellerInputMode(null);
    setAiDraft(null);
    setSellerPreviewImage(null);
    setSellerHasVideo(false);
  }, []);

  const runAiProcessing = useCallback(
    async (
      mode: SellerInputMode,
      opts?: {
        transcript?: string;
        previewImage?: string | null;
        videoUrl?: string;
      }
    ) => {
      setSellerStep("processing");

      try {
        const coords = await getUserCoords();
        let locationHint = user.city;
        if (coords) {
          const d = distanceToCity(coords, user.city);
          if (d !== null && d < 50) locationHint = user.city;
        }

        const ctx = {
          imageDataUrl: opts?.previewImage,
          transcript: opts?.transcript,
          userCity: locationHint,
          contact: user.phone,
        };

        let extracted: AiExtractedListing;
        if (mode === "combined") {
          extracted = await extractCombined(ctx);
        } else if (mode === "upload") {
          extracted = await extractFromImage(ctx);
        } else if (mode === "text") {
          extracted = await extractFromText(ctx);
        } else {
          extracted = await extractFromVoice(ctx);
        }

        if (!extracted.location && locationHint) {
          extracted = { ...extracted, location: locationHint };
        }

        const geo = geocodeLocation(extracted.location);
        extracted = {
          ...extracted,
          attributes: {
            ...(extracted.attributes ?? {}),
            _geoLat: String(geo.lat),
            _geoLng: String(geo.lng),
          },
        };

        if (opts?.videoUrl) {
          const vid = parseVideoUrl(opts.videoUrl);
          if (vid.thumbnail && !opts.previewImage) {
            setSellerPreviewImage(vid.thumbnail);
          }
          setSellerHasVideo(vid.hasVideo);
        }

        setAiDraft(extracted);
        setSellerStep("confirmation");
      } catch {
        alert(
          "AI analizė nepavyko. Bandykite dar kartą arba patikrinkite AI nustatymus profilyje."
        );
        resetSellerFlow();
      }
    },
    [resetSellerFlow, user.city, user.phone]
  );

  const submitSellerContent = useCallback(
    async (payload: {
      text?: string;
      imageDataUrl?: string | null;
      videoUrl?: string;
    }) => {
      if (payload.imageDataUrl) setSellerPreviewImage(payload.imageDataUrl);
      if (payload.videoUrl) {
        const vid = parseVideoUrl(payload.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (vid.thumbnail && !payload.imageDataUrl) {
          setSellerPreviewImage(vid.thumbnail);
        }
      }

      const mode: SellerInputMode =
        payload.imageDataUrl && payload.text
          ? "combined"
          : payload.imageDataUrl
            ? "upload"
            : "text";

      setSellerInputMode(mode);
      await runAiProcessing(mode, {
        transcript: payload.text,
        previewImage: payload.imageDataUrl ?? parseVideoUrl(payload.videoUrl ?? "").thumbnail,
        videoUrl: payload.videoUrl,
      });
    },
    [runAiProcessing]
  );

  const completeVoiceRecording = useCallback(
    (transcript: string | null) => {
      if (!transcript) {
        resetSellerFlow();
        return;
      }
      runAiProcessing("voice", { transcript });
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

    if (aiDraft.price <= 0) {
      alert("Įveskite kainą prieš publikuojant.");
      return;
    }

    const mod = moderateListing(aiDraft);
    if (!mod.allowed) {
      alert(mod.reason);
      return;
    }

    if (isDuplicateListing(aiDraft.title, user.id, listings)) {
      alert(
        "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą."
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
      typeof aiDraft.attributes?.vin === "string"
        ? aiDraft.attributes.vin
        : undefined;
    const vinOk = vin ? verifyVin(vin) : false;

    const createdAt = new Date().toISOString();
    const newListing: Listing = enrichListingCoords({
      id: `l-${Date.now()}`,
      title: aiDraft.title,
      price: aiDraft.price,
      location: aiDraft.location,
      distanceKm: distKm,
      slug: generateListingSlug(aiDraft.title, aiDraft.location),
      image:
        sellerPreviewImage ??
        PLACEHOLDER_IMAGES[aiDraft.category] ??
        PLACEHOLDER_IMAGES.other,
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
        aiDraft.category === "services" && isVerifiedServiceSeller(user.id),
    });

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
    }

    setListings((prev) => [newListing, ...prev]);
    setSellerStep("published");

    setTimeout(resetSellerFlow, 2000);
  }, [
    aiDraft,
    sellerPreviewImage,
    sellerHasVideo,
    resetSellerFlow,
    user.id,
    listings,
    buyerCoords,
  ]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      setToast({ message, type });
    },
    []
  );

  const clearToast = useCallback(() => setToast(null), []);

  const requestMediaConsent = useCallback((onGranted: () => void) => {
    if (gdprConsent) {
      onGranted();
      return;
    }
    gdprPendingAction.current = onGranted;
    setGdprModalOpen(true);
  }, [gdprConsent]);

  const acceptGdprConsent = useCallback(() => {
    setGdprConsent(true);
    saveGdprConsent(true);
    setGdprModalOpen(false);
    const action = gdprPendingAction.current;
    gdprPendingAction.current = null;
    action?.();
  }, []);

  const declineGdprConsent = useCallback(() => {
    setGdprModalOpen(false);
    gdprPendingAction.current = null;
  }, []);

  const revokeGdprConsent = useCallback(() => {
    setGdprConsent(false);
    saveGdprConsent(false);
  }, []);

  const scheduleIncomingSms = useCallback(
    (
      chatId: string,
      messageId: string,
      recipientId: string,
      listingTitle: string
    ) => {
      smsCancelRef.current.get(chatId)?.();

      const cancel = scheduleSmsFallback(
        { chatId, messageId, recipientId, listingTitle },
        () => {
          const chat = chatsRef.current.find((c) => c.id === chatId);
          if (!chat) return false;
          if (activeChatIdRef.current === chatId) return false;
          if (chat.smsFallbackSentFor === messageId) return false;
          const msg = chat.messages.find((m) => m.id === messageId);
          if (!msg || msg.readAt) return false;
          return msg.senderId !== recipientId;
        },
        (text) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, smsFallbackSentFor: messageId } : c
            )
          );
          showToast(`📱 SMS: ${text}`, "info");
        }
      );

      smsCancelRef.current.set(chatId, cancel);
    },
    [showToast]
  );

  const markChatRead = useCallback((chatId: string) => {
    const now = new Date().toISOString();
    smsCancelRef.current.get(chatId)?.();
    smsCancelRef.current.delete(chatId);
    setChats((prev) => {
      const next = prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              lastReadAt: now,
              messages: c.messages.map((m) =>
                m.readAt ? m : { ...m, readAt: now }
              ),
            }
          : c
      );
      if (isDataApiEnabled()) {
        const updated = next.find((c) => c.id === chatId);
        if (updated) {
          void apiUpsertChat(updated, user.id).then((r) => {
            if (!r.ok) setSyncError(`Pokalbio būsena neišsaugota: ${r.error}`);
          });
        }
      }
      return next;
    });
  }, [user.id]);

  const setActiveChatId = useCallback(
    (chatId: string | null) => {
      activeChatIdRef.current = chatId;
      if (chatId) markChatRead(chatId);
    },
    [markChatRead]
  );

  const findListing = useCallback(
    (idOrSlug: string) =>
      listings.find((l) => l.id === idOrSlug || l.slug === idOrSlug),
    [listings]
  );

  const startUploadFlow = useCallback(async () => {
    requestMediaConsent(async () => {
      const photo = await capturePhoto();
      if (!photo) return;

      setSellerPreviewImage(photo);
      setSellerInputMode("upload");
      await runAiProcessing("upload", { previewImage: photo });
    });
  }, [runAiProcessing, requestMediaConsent]);

  const startVoiceFlow = useCallback(() => {
    requestMediaConsent(() => {
      setSellerInputMode("voice");
      setSellerStep("recording");
    });
  }, [requestMediaConsent]);

  const cancelSellerFlow = useCallback(() => {
    resetSellerFlow();
  }, [resetSellerFlow]);

  const sendMessage = useCallback(
    (chatId: string, text: string) => {
      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        senderId: user.id,
        text,
        timestamp: new Date().toISOString(),
      };

      let sellerId = "";
      let listingTitle = "";

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;

          sellerId = chat.sellerId;
          listingTitle = chat.listingTitle;

          const updated: ChatThread = {
            ...chat,
            messages: [...chat.messages, msg],
          };

          if (!chat.escrowOffered && detectPurchaseIntent(text)) {
            updated.escrowOffered = true;
          }

          if (isDataApiEnabled()) {
            void apiUpsertChat(updated, user.id).then((r) => {
              if (!r.ok) setSyncError(`Žinutė neišsaugota: ${r.error}`);
            });
          }
          return updated;
        })
      );

      window.setTimeout(() => {
        const replyId = `m-${Date.now()}`;
        const reply: ChatMessage = {
          id: replyId,
          senderId: sellerId,
          text: "Ačiū už žinutę! Pardavėjas atsakys netrukus.",
          timestamp: new Date().toISOString(),
        };

        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: [...c.messages, reply] }
              : c
          )
        );

        scheduleIncomingSms(chatId, replyId, user.id, listingTitle);
      }, 3000);
    },
    [user.id, scheduleIncomingSms]
  );

  const startChat = useCallback(
    (listingId: string): string | null => {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing || listing.sellerId === user.id) return null;

      const existing = chats.find(
        (c) => c.listingId === listingId && c.buyerId === user.id
      );
      if (existing) return existing.id;

      const chatId = `chat-${Date.now()}`;
      const newChat: ChatThread = {
        id: chatId,
        listingId,
        listingTitle: listing.title,
        buyerId: user.id,
        sellerId: listing.sellerId,
        messages: [
          {
            id: `m-${Date.now()}`,
            senderId: user.id,
            text: `Labas! Dominu „${listing.title}".`,
            timestamp: new Date().toISOString(),
          },
        ],
        escrowOffered: false,
      };

      setChats((prev) => [newChat, ...prev]);
      if (isDataApiEnabled()) {
        void apiUpsertChat(newChat, user.id).then((r) => {
          if (!r.ok) setSyncError(`Pokalbis neišsaugotas: ${r.error}`);
        });
      }
      return chatId;
    },
    [listings, chats, user.id]
  );

  const updateEscrow = useCallback(
    (chatId: string, escrow: EscrowTransaction) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, escrow } : chat
        )
      );
      if (isDataApiEnabled()) {
        void apiUpsertEscrow(escrow).then((r) => {
          if (!r.ok) setSyncError(`Escrow neišsaugotas: ${r.error}`);
        });
      }
    },
    []
  );

  const login = useCallback(
    (data: {
      provider: AuthProvider;
      phone?: string;
      role: UserRole;
      businessType?: ProBusinessType;
      email?: string;
    }) => {
      if (data.email === ADMIN_EMAIL || data.role === "admin") {
        const adminUser: UserProfile = {
          id: "admin-1",
          name: "Vauto Admin",
          email: ADMIN_EMAIL,
          avatar:
            "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop",
          phone: "+370 600 00001",
          city: "Vilnius",
          authProvider: data.provider,
          role: "admin",
          walletBalance: 0,
        };
        setUser(adminUser);
        setIsAuthenticated(true);
        saveUser(adminUser);
        saveAuthSession({
          isAuthenticated: true,
          provider: data.provider,
          loggedInAt: new Date().toISOString(),
        });
        return;
      }

      const names: Record<AuthProvider, string> = {
        google: "Google vartotojas",
        apple: "Apple vartotojas",
        phone: "Mobilus vartotojas",
      };
      const nextUser: UserProfile = {
        ...user,
        id: user.id.startsWith("user-") ? user.id : `user-${Date.now()}`,
        name: names[data.provider],
        phone: data.phone ?? user.phone,
        authProvider: data.provider,
        role: data.role,
        businessType: data.businessType,
        walletBalance: data.role === "pro" ? 25 : 0,
        avatar:
          data.provider === "apple"
            ? "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
            : user.avatar,
      };
      setUser(nextUser);
      setIsAuthenticated(true);
      saveUser(nextUser);
      saveAuthSession({
        isAuthenticated: true,
        provider: data.provider,
        loggedInAt: new Date().toISOString(),
      });
    },
    [user]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    clearAuthSession();
    setUser({ ...MOCK_USER, role: "private", walletBalance: 0 });
    saveUser({ ...MOCK_USER, role: "private", walletBalance: 0 });
  }, []);

  const topUpWallet = useCallback((amount: number) => {
    setUser((prev) => {
      const next = {
        ...prev,
        walletBalance: (prev.walletBalance ?? 0) + amount,
      };
      if (!apiActive) saveUser(next);
      return next;
    });
  }, [apiActive]);

  const updateListing = useCallback(
    (id: string, patch: Partial<Pick<Listing, "title" | "price" | "status">>) => {
      setListings((prev) =>
        prev.map((l) => (l.id === id && l.sellerId === user.id ? { ...l, ...patch } : l))
      );
      if (isDataApiEnabled()) {
        void apiUpdateListing(id, user.id, patch).then((r) => {
          if (!r.ok) setSyncError(`Nepavyko atnaujinti: ${r.error}`);
        });
      }
    },
    [user.id]
  );

  const markListingSold = useCallback(
    (id: string) => updateListing(id, { status: "sold" }),
    [updateListing]
  );

  const promoteListing = useCallback(
    (listingId: string, cost: number): boolean => {
      const balance = user.walletBalance ?? 0;
      if (balance < cost) return false;
      setUser((prev) => {
        const next = { ...prev, walletBalance: balance - cost };
        if (!apiActive) saveUser(next);
        return next;
      });
      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== listingId) return l;
          const m = mockListingMetrics(l);
          return {
            ...l,
            promoted: true,
            views: m.views + 150,
            clicks: m.clicks + 20,
            interestScore: Math.min(99, m.interestScore + 12),
          };
        })
      );
      return true;
    },
    [user.walletBalance, apiActive]
  );

  const submitReport = useCallback(
    (data: {
      category: ReportCategory;
      comment: string;
      listingId?: string;
      listingTitle?: string;
      chatId?: string;
      reportedUserId?: string;
      chatPreview?: string;
    }) => {
      const report: SupportReport = {
        id: `rep-${Date.now()}`,
        reporterId: user.id,
        reporterName: user.name,
        category: data.category,
        urgency: categoryToUrgency(data.category),
        status: "open",
        comment: data.comment,
        listingId: data.listingId,
        listingTitle: data.listingTitle,
        chatId: data.chatId,
        reportedUserId: data.reportedUserId,
        chatPreview: data.chatPreview,
        createdAt: new Date().toISOString(),
      };
      setReports((prev) => [report, ...prev]);
      if (isDataApiEnabled()) {
        void apiSubmitReport(report).then((r) => {
          if (!r.ok) setSyncError(`Pranešimas neišsaugotas: ${r.error}`);
        });
      }
    },
    [user.id, user.name]
  );

  const resolveReport = useCallback(
    (reportId: string, status: ReportStatus, notify = true) => {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      if (isDataApiEnabled()) {
        void apiUpdateReportStatus(reportId, status);
      }
      if (notify) {
        showToast(
          status === "resolved" ? "Pranešimas uždarytas" : "Pranešimas atmestas",
          "success"
        );
      }
    },
    [showToast]
  );

  const warnFromReport = useCallback(
    (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;
      if (report.reportedUserId) {
        if (report.reportedUserId === user.id) {
          setUser((prev) => ({ ...prev, warned: true }));
          if (!apiActive) saveUser({ ...user, warned: true });
        }
        if (isDataApiEnabled()) {
          void apiWarnUser(report.reportedUserId);
        }
      }
      resolveReport(reportId, "resolved", false);
      showToast("Vartotojas įspėtas", "success");
    },
    [reports, resolveReport, showToast, user, apiActive]
  );

  const banFromReport = useCallback(
    (reportId: string) => {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;

      if (report.listingId) {
        setListings((prev) =>
          prev.map((l) =>
            l.id === report.listingId ? { ...l, banned: true } : l
          )
        );
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(report.listingId!);
          return next;
        });
      }

      if (report.reportedUserId) {
        setBannedUserIds((prev) => {
          const next = new Set(prev).add(report.reportedUserId!);
          if (isDataApiEnabled()) {
            void apiSetBannedUsers(Array.from(next));
          }
          return next;
        });
        setListings((prev) =>
          prev.map((l) =>
            l.sellerId === report.reportedUserId
              ? { ...l, banned: true }
              : l
          )
        );
      }

      if (report.listingId && isDataApiEnabled()) {
        const listing = listings.find((l) => l.id === report.listingId);
        if (listing) {
          void apiUpdateListing(listing.id, listing.sellerId, { banned: true });
        }
      }

      resolveReport(reportId, "resolved", false);
      showToast("Skelbimas/vartotojas užblokuotas", "success");
    },
    [reports, resolveReport, showToast, listings]
  );

  const value: VautoContextValue = {
    user,
    updateUser,
    listings,
    savedIds,
    searchQuery,
    setSearchQuery,
    activeFilterIds,
    toggleFilter,
    rankedListings,
    dynamicFilters,
    toggleSave,
    deleteListing,
    renewListing,
    syncError,
    clearSyncError,
    sellerStep,
    sellerInputMode,
    aiDraft,
    sellerPreviewImage,
    startUploadFlow,
    startVoiceFlow,
    completeVoiceRecording,
    cancelVoiceRecording,
    updateAiDraft,
    publishListing,
    cancelSellerFlow,
    submitSellerContent,
    chats,
    sendMessage,
    startChat,
    updateEscrow,
    isAuthenticated,
    login,
    logout,
    topUpWallet,
    promoteListing,
    updateListing,
    markListingSold,
    isAdmin,
    reports,
    bannedUserIds,
    submitReport,
    warnFromReport,
    banFromReport,
    resolveReport,
    toast,
    showToast,
    clearToast,
    buyerCoords,
    gdprConsent,
    gdprModalOpen,
    requestMediaConsent,
    acceptGdprConsent,
    declineGdprConsent,
    revokeGdprConsent,
    setActiveChatId,
    markChatRead,
    findListing,
  };

  return (
    <VautoContext.Provider value={value}>
      {children}
      <GdprConsentModal
        open={gdprModalOpen}
        onAccept={acceptGdprConsent}
        onDecline={declineGdprConsent}
      />
    </VautoContext.Provider>
  );
}

export function useVauto() {
  const ctx = useContext(VautoContext);
  if (!ctx) throw new Error("useVauto must be used within VautoProvider");
  return ctx;
}

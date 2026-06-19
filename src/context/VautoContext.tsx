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
  ANONYMOUS_USER,
  INITIAL_CHATS,
  INITIAL_LISTINGS,
} from "@/data/mockListings";
import { mergeApiWithDemoCatalog } from "@/lib/merge-listings";
import {
  detectPurchaseIntent,
  detectSellerListingIntent,
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
  loadSearchIntent,
  loadSoldPromptDismissed,
  loadWakeWordEnabled,
  loadAlertQueries,
  loadPushAlertsSeen,
  loadPushAlertsEnabled,
  savePushAlertsEnabled,
  loadUser,
  saveBannedUserIds,
  saveChats,
  saveGdprConsent,
  saveListings,
  saveReports,
  saveSavedIds,
  saveSearchIntent,
  saveSoldPromptDismissed,
  saveWakeWordEnabled,
  saveAlertQueries,
  savePushAlertsSeen,
} from "@/lib/storage";
import { capturePhoto } from "@/lib/native-media";
import { distanceToCity, getUserCoords, type UserCoords } from "@/lib/geolocation";
import {
  distanceToListing,
  enrichListingCoords,
  geocodeLocation,
} from "@/lib/geocoding";
import { normalizeListings } from "@/lib/listing-normalize";
import { generateListingSlug, listingPath } from "@/lib/seo";
import { scheduleSmsFallback } from "@/lib/sms-fallback";
import {
  isVerifiedServiceProvider,
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
import { isDataApiEnabled, initDataApiConfig } from "@/lib/api/config";
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
import type {
  AiExtractedListing,
  ChatMessage,
  ChatThread,
  EscrowTransaction,
  Listing,
  ReportCategory,
  ReportStatus,
  SellerFlowStep,
  SellerInputMode,
  SupportReport,
  SellerReview,
  UserProfile,
} from "@/lib/types";
import { mockListingMetrics } from "@/lib/dashboard-mock";
import { bumpListingMetric, aggregateSellerMetrics } from "@/lib/listing-analytics";
import {
  countBuyerIntentForSeller,
  getPopularListingIds,
  recordSearchIntent,
  type SearchIntentEvent,
} from "@/lib/search-intent";
import { categoryToUrgency } from "@/lib/reports";
import { DEMO_REPORTS } from "@/data/mockReports";
import { GdprConsentModal } from "@/components/privacy/GdprConsentModal";
import { useAuth, type LoginPayload } from "@/context/AuthContext";
import { useReviews } from "@/context/ReviewsContext";
import { apiTopUpWallet, apiPromoteListing } from "@/lib/api/wallet-reviews";
import { registerWebPush } from "@/lib/web-push";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { logAnalytics } from "@/lib/analytics";
import { ReviewPromptHost } from "@/components/reviews/ReviewPromptHost";
import {
  buildBuddySoldFollowUp,
} from "@/lib/buddy-messages";
import { speakBuddyMessage, stopBuddySpeech } from "@/lib/buddy-voice";
import {
  adaptiveKeyToTheme,
  type ChameleonThemeId,
} from "@/lib/chameleon-themes";
import { listingToAdaptiveKey, getMissingCriticalFields } from "@/lib/adaptive-categories";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import { WakeWordHost } from "@/components/voice/WakeWordHost";
import { ChameleonThemeHost } from "@/components/theme/ChameleonThemeHost";
import {
  createWakeWordSession,
  logWakeEvent,
  resumePassivePhase,
  type WakeWordSession,
} from "@/lib/wake-word-engine";
import type { WakeWordPhase } from "@/lib/wake-word-types";
import {
  executeVoiceIntent,
  parseVoiceIntent,
} from "@/lib/voice-intent-engine";
import {
  requestNotificationPermission,
  showLocalPushNotification,
  startPushAlertPolling,
  type PushAlertPayload,
} from "@/lib/push-alerts";

export interface PendingReviewPrompt {
  listingId: string;
  listingTitle: string;
  sellerId: string;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

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
  sellerUserPrompt: string | null;
  searchVoiceMode: boolean;
  setSearchVoiceMode: (voice: boolean) => void;
  aiDraft: AiExtractedListing | null;
  /** True when AI extraction failed — show structural manual form */
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
  submitSellerContent: (payload: {
    text?: string;
    imageDataUrl?: string | null;
    videoUrl?: string;
    /** Set when input came from microphone — preserves voice mode + TTS */
    voiceCapture?: boolean;
  }) => Promise<void>;
  /** Voice/text on home search that expresses sell/post intent → listing flow */
  startListingFromQuery: (text: string) => boolean;
  pendingSellerQuery: string | null;
  consumePendingSellerQuery: () => string | null;

  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
  updateEscrow: (chatId: string, escrow: EscrowTransaction) => void;

  isAuthenticated: boolean;
  authModalOpen: boolean;
  authRedirectPath: string | null;
  openAuthModal: (redirectPath?: string) => void;
  closeAuthModal: () => void;
  clearAuthRedirect: () => void;
  requireAuthForListing: (redirectPath?: string) => boolean;
  login: (data: LoginPayload) => Promise<void>;
  logout: () => void;
  topUpWallet: (amount: number) => void;
  promoteListing: (listingId: string, cost: number) => boolean;
  updateListing: (id: string, patch: ListingEditPatch) => void;
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
  toast: { message: string; type: "success" | "error" | "info" | "buddy" } | null;
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

  reviews: SellerReview[];
  submitReview: (data: {
    listingId: string;
    listingTitle: string;
    sellerId: string;
    rating: number;
    comment?: string;
  }) => void;
  trackListingView: (listingId: string) => void;
  trackListingCall: (listingId: string) => void;
  popularListingIds: string[];
  recentSoldStories: { id: string; title: string; location: string; timeAgo: string }[];
  buyerIntentCount: number;
  soldPromptDismissed: Set<string>;
  dismissSoldPrompt: (listingId: string) => void;
  sellerAnalytics: ReturnType<typeof aggregateSellerMetrics>;
  pendingReview: PendingReviewPrompt | null;
  queueReviewPrompt: (data: PendingReviewPrompt & { delayMs?: number }) => void;
  clearReviewPrompt: () => void;

  wakeWordEnabled: boolean;
  wakeWordPhase: WakeWordPhase;
  wakeWordStatusText: string | undefined;
  wakeWordTranscript: string | undefined;
  setWakeWordEnabled: (enabled: boolean) => void;
  requestWakeWordConsent: () => void;
  disableWakeWordInstantly: () => void;

  pushAlertsEnabled: boolean;
  setPushAlertsEnabled: (enabled: boolean) => void;

  confirmDialog: ConfirmDialogState | null;
  showConfirm: (opts: ConfirmDialogState) => Promise<boolean>;
  dismissConfirm: (confirmed: boolean) => void;

  chameleonTheme: ChameleonThemeId;
  detectedAdaptiveKey: AdaptiveCategoryKey | null;
}

const DEMO_SOLD_STORIES = [
  { id: "story-1", title: "Dviratis", location: "Panevėžys", timeAgo: "prieš 2 d." },
  { id: "story-2", title: "iPhone 13", location: "Vilnius", timeAgo: "prieš 3 d." },
  { id: "story-3", title: "Žolės pjovimas", location: "Panevėžys", timeAgo: "šiandien" },
];

function formatTimeAgo(iso: string): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (days <= 0) return "šiandien";
  if (days === 1) return "vakar";
  return `prieš ${days} d.`;
}

function anonymizeTitle(title: string): string {
  const words = title.split(/\s+/);
  return words.slice(0, 2).join(" ") + (words.length > 2 ? "…" : "");
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
  jobs:
    "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&h=400&fit=crop",
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
  const {
    user,
    isAuthenticated,
    isAdmin,
    updateUser: patchAuthUser,
    openAuthModal,
    closeAuthModal,
    clearAuthRedirect,
    requireAuthForListing,
    login,
    logout,
    authModalOpen,
    authRedirectPath,
  } = useAuth();
  const { reviews, submitReview } = useReviews();

  const [hydrated, setHydrated] = useState(false);
  const [apiActive, setApiActive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>(INITIAL_LISTINGS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterIds, setActiveFilterIds] = useState<Set<string>>(
    new Set()
  );
  const [chats, setChats] = useState<ChatThread[]>(INITIAL_CHATS);
  const [reports, setReports] = useState<SupportReport[]>(DEMO_REPORTS);
  const [bannedUserIds, setBannedUserIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "buddy";
  } | null>(null);
  const [buyerCoords, setBuyerCoords] = useState<UserCoords | null>(null);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [gdprModalOpen, setGdprModalOpen] = useState(false);
  const [searchIntentEvents, setSearchIntentEvents] = useState<SearchIntentEvent[]>([]);
  const [soldPromptDismissed, setSoldPromptDismissed] = useState<Set<string>>(new Set());
  const [pendingReview, setPendingReview] = useState<PendingReviewPrompt | null>(null);
  const [sellerUserPrompt, setSellerUserPrompt] = useState<string | null>(null);
  const [searchVoiceMode, setSearchVoiceMode] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(false);
  const [pushAlertsEnabled, setPushAlertsEnabledState] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [wakeWordPhase, setWakeWordPhase] = useState<WakeWordPhase>("off");
  const [wakeWordStatusText, setWakeWordStatusText] = useState<string>();
  const [wakeWordTranscript, setWakeWordTranscript] = useState<string>();
  const [chameleonTheme, setChameleonTheme] = useState<ChameleonThemeId>("flux");
  const [detectedAdaptiveKey, setDetectedAdaptiveKey] =
    useState<AdaptiveCategoryKey | null>(null);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buddyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChatIdRef = useRef<string | null>(null);
  const viewedListingsRef = useRef<Set<string>>(new Set());
  const smsCancelRef = useRef<Map<string, () => void>>(new Map());
  const gdprPendingAction = useRef<(() => void) | null>(null);
  const gdprWakeWordPending = useRef(false);
  const wakeWordSessionRef = useRef<WakeWordSession | null>(null);
  const pushAlertsSeenRef = useRef<Set<string>>(new Set());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const searchIntentRef = useRef(searchIntentEvents);
  searchIntentRef.current = searchIntentEvents;
  const alertQueriesRef = useRef<string[]>([]);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    async function load() {
      await initDataApiConfig();
      if (isDataApiEnabled() && (await apiHealthCheck())) {
        setApiActive(true);
        const storedUser = loadUser();
        const auth = loadAuthSession();
        const uid = storedUser?.id && auth?.isAuthenticated ? storedUser.id : ANONYMOUS_USER.id;
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
          const fromApi = listingsRes.data.map(withDefaultExpiry);
          setListings(
            normalizeListings(
              mergeApiWithDemoCatalog(fromApi, INITIAL_LISTINGS)
            )
          );
        } else errors.push(listingsRes.error);
        if (chatsRes.ok) setChats(chatsRes.data);
        else errors.push(chatsRes.error);
        if (savedRes.ok) setSavedIds(new Set(savedRes.data));
        else errors.push(savedRes.error);
        if (userRes.ok && auth?.isAuthenticated) {
          patchAuthUser(userRes.data);
        } else if (storedUser && auth?.isAuthenticated) {
          patchAuthUser({ role: "private", walletBalance: 0, ...storedUser });
        }
        if (reportsRes.ok && reportsRes.data.length) setReports(reportsRes.data);
        else if (reportsRes.ok) setReports(DEMO_REPORTS);
        else errors.push(reportsRes.error);
        if (bannedRes.ok) setBannedUserIds(new Set(bannedRes.data));
        else errors.push(bannedRes.error);

        const storedIntent = loadSearchIntent();
        if (storedIntent) setSearchIntentEvents(storedIntent);
        const storedDismissed = loadSoldPromptDismissed();
        if (storedDismissed) setSoldPromptDismissed(new Set(storedDismissed));

        if (loadGdprConsent() && loadWakeWordEnabled()) setWakeWordEnabledState(true);
        const seenPush = loadPushAlertsSeen();
        if (seenPush) pushAlertsSeenRef.current = new Set(seenPush);
        const storedAlerts = loadAlertQueries();
        if (storedAlerts) alertQueriesRef.current = storedAlerts;
        setPushAlertsEnabledState(loadPushAlertsEnabled());

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
      if (auth?.isAuthenticated && storedUser) {
        patchAuthUser({ role: "private", walletBalance: 0, ...storedUser });
      }
      if (storedListings?.length) {
        setListings(normalizeListings(storedListings));
      }
      if (storedChats?.length) setChats(storedChats);
      if (storedSaved) setSavedIds(new Set(storedSaved));
      if (storedReports?.length) setReports(storedReports);
      else saveReports(DEMO_REPORTS);
      if (storedBanned?.length) setBannedUserIds(new Set(storedBanned));
      const storedIntent = loadSearchIntent();
      if (storedIntent) setSearchIntentEvents(storedIntent);
      const storedDismissed = loadSoldPromptDismissed();
      if (storedDismissed) setSoldPromptDismissed(new Set(storedDismissed));
      if (loadGdprConsent() && loadWakeWordEnabled()) setWakeWordEnabledState(true);
      const seenPush = loadPushAlertsSeen();
      if (seenPush) pushAlertsSeenRef.current = new Set(seenPush);
      const storedAlerts = loadAlertQueries();
      if (storedAlerts) alertQueriesRef.current = storedAlerts;
      setPushAlertsEnabledState(loadPushAlertsEnabled());
      setGdprConsent(loadGdprConsent());
      setHydrated(true);
    }
    void load();
  }, []);

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

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSearchIntent(searchIntentEvents);
  }, [searchIntentEvents, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSoldPromptDismissed(Array.from(soldPromptDismissed));
  }, [soldPromptDismissed, hydrated, apiActive]);

  const [sellerStep, setSellerStep] = useState<SellerFlowStep>("idle");
  const [sellerInputMode, setSellerInputMode] =
    useState<SellerInputMode>(null);
  const [aiDraft, setAiDraft] = useState<AiExtractedListing | null>(null);
  const [aiManualFallback, setAiManualFallback] = useState(false);
  const [sellerPreviewImage, setSellerPreviewImage] = useState<string | null>(
    null
  );
  const [sellerVideoUrl, setSellerVideoUrl] = useState("");
  const [pendingSellerQuery, setPendingSellerQuery] = useState<string | null>(
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

  const updateUser = useCallback(
    (patch: Partial<UserProfile>) => {
      patchAuthUser(patch);
      if (isDataApiEnabled()) {
        void apiUpdateUser({ ...user, ...patch }).then((r) => {
          if (!r.ok) setSyncError(`Profilis neišsaugotas: ${r.error}`);
        });
      }
    },
    [patchAuthUser, user]
  );

  const dynamicFilters = useMemo(
    () => generateDynamicFilters(searchQuery),
    [searchQuery]
  );

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

  const popularListingIds = useMemo(
    () => getPopularListingIds(visibleListings, 4),
    [visibleListings]
  );

  const recentSoldStories = useMemo(() => {
    const sold = listings
      .filter((l) => l.status === "sold")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 3)
      .map((l) => ({
        id: l.id,
        title: anonymizeTitle(l.title),
        location: l.location,
        timeAgo: formatTimeAgo(l.createdAt),
      }));
    return sold.length > 0 ? sold : DEMO_SOLD_STORIES;
  }, [listings]);

  const myActiveListings = useMemo(
    () =>
      listings.filter(
        (l) => l.sellerId === user.id && l.status !== "sold" && !l.banned
      ),
    [listings, user.id]
  );

  const buyerIntentCount = useMemo(
    () => countBuyerIntentForSeller(searchIntentEvents, myActiveListings),
    [searchIntentEvents, myActiveListings]
  );

  const sellerAnalytics = useMemo(
    () =>
      aggregateSellerMetrics(
        listings.filter((l) => l.sellerId === user.id)
      ),
    [listings, user.id]
  );

  const handleSearchQuery = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim().length >= 2) {
      setSearchIntentEvents((prev) => recordSearchIntent(prev, q));
    }
  }, []);

  const bumpListingById = useCallback(
    (id: string, field: "views" | "callClicks" | "chatStarts" | "saveCount") => {
      setListings((prev) =>
        prev.map((l) => (l.id === id ? bumpListingMetric(l, field) : l))
      );
    },
    []
  );

  const trackListingView = useCallback(
    (listingId: string) => {
      if (viewedListingsRef.current.has(listingId)) return;
      viewedListingsRef.current.add(listingId);
      bumpListingById(listingId, "views");
      const listing = listings.find((l) => l.id === listingId);
      logAnalytics("listing_view", {
        listingId,
        title: listing?.title,
        location: listing?.location,
      });
    },
    [bumpListingById, listings]
  );

  const trackListingCall = useCallback(
    (listingId: string) => {
      bumpListingById(listingId, "callClicks");
      const listing = listings.find((l) => l.id === listingId);
      logAnalytics("listing_call_click", {
        listingId,
        title: listing?.title,
        sellerId: listing?.sellerId,
        phone: listing?.contact ? "present" : "fallback",
      });
    },
    [bumpListingById, listings]
  );

  const queueReviewPrompt = useCallback(
    (data: PendingReviewPrompt & { delayMs?: number }) => {
      if (!isAuthenticated || user.id === "guest") return;
      if (user.id === data.sellerId) return;
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
      const show = () => setPendingReview(data);
      if (data.delayMs && data.delayMs > 0) {
        reviewTimerRef.current = setTimeout(show, data.delayMs);
      } else {
        show();
      }
    },
    [isAuthenticated, user.id]
  );

  const clearReviewPrompt = useCallback(() => {
    setPendingReview(null);
    if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
  }, []);

  const scheduleSellerEngagementPush = useCallback(
    (listingId: string, location: string, listingTitle: string) => {
      if (engagementTimerRef.current) clearTimeout(engagementTimerRef.current);
      if (buddyFollowUpTimerRef.current) clearTimeout(buddyFollowUpTimerRef.current);

      engagementTimerRef.current = setTimeout(() => {
        const city = location.split(",")[0]?.trim() || "jūsų regione";
        const msg = `Skelbimas „${listingTitle}" publikuotas ${city}. Stebėkite peržiūras profilyje.`;
        logAnalytics("seller_engagement_push", { listingId, location, type: "publish_confirm" });
        setToast({ message: msg, type: "success" });
      }, 8000);

      buddyFollowUpTimerRef.current = setTimeout(() => {
        const followUp = buildBuddySoldFollowUp(user.name, listingTitle);
        logAnalytics("seller_engagement_push", {
          listingId,
          type: "sold_follow_up",
        });
        setToast({ message: followUp, type: "info" });
      }, 120_000);
    },
    [user.name]
  );

  const toggleFilter = useCallback((id: string) => {
    setActiveFilterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSave = useCallback((id: string) => {
    if (!isAuthenticated) {
      const listing = listings.find((l) => l.id === id);
      openAuthModal(listing ? listingPath(listing) : "/");
      return;
    }
    setSavedIds((prev) => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (adding) bumpListingById(id, "saveCount");
      if (isDataApiEnabled()) {
        void apiUpdateSaved(user.id, Array.from(next)).then((r) => {
          if (!r.ok) setSyncError(`Išsaugota nepavyko: ${r.error}`);
        });
      }
      return next;
    });
  }, [user.id, isAuthenticated, listings, openAuthModal, bumpListingById]);

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
    setSellerUserPrompt(null);
    setAiDraft(null);
    setAiManualFallback(false);
    setSellerPreviewImage(null);
    setSellerVideoUrl("");
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
      const started = performance.now();
      setSellerStep("processing");
      setAiManualFallback(false);

      const promptText =
        opts?.transcript?.trim() ||
        (mode === "upload" ? "Įkelta nuotrauka — analizuoju…" : null);
      if (promptText) setSellerUserPrompt(promptText);

      logAiSafeguard("processing_start", { mode, hasImage: Boolean(opts?.previewImage) });

      const enterManualFallback = (reason: string, error?: unknown) => {
        const elapsedMs = Math.round(performance.now() - started);
        logAiSafeguard("fallback_triggered", {
          mode,
          reason,
          elapsedMs,
          error: error instanceof Error ? error.message : String(error ?? ""),
        });

        setToast({ message: MANUAL_FALLBACK_TOAST, type: "info" });
        setAiManualFallback(true);
        setAiDraft(
          createManualFallbackDraft({
            location: user.city,
            contact: user.phone,
          })
        );
        setSellerStep("confirmation");
      };

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
        const extractPromise = (async () => {
          if (mode === "combined") {
            return extractCombined(ctx);
          }
          if (mode === "upload") {
            return extractFromImage(ctx);
          }
          if (mode === "text") {
            return extractFromText(ctx);
          }
          return extractFromVoice(ctx);
        })();

        extracted = await withAiTimeout(extractPromise, undefined, `extract_${mode ?? "unknown"}`);

        if (!isValidAiExtracted(extracted)) {
          logAiSafeguard("processing_invalid", {
            mode,
            elapsedMs: Math.round(performance.now() - started),
            title: extracted?.title ?? null,
            category: extracted?.category ?? null,
          });
          enterManualFallback("invalid_extraction");
          return;
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
          setSellerVideoUrl(opts.videoUrl);
          const vid = parseVideoUrl(opts.videoUrl);
          if (vid.thumbnail && !opts.previewImage) {
            setSellerPreviewImage(vid.thumbnail);
          }
          setSellerHasVideo(vid.hasVideo);
        }

        logAiSafeguard("processing_success", {
          mode,
          elapsedMs: Math.round(performance.now() - started),
          category: extracted.category,
          confidence: extracted.confidence,
        });

        setAiDraft(extracted);
        setSellerStep("confirmation");
      } catch (error) {
        if (error instanceof AiSafeguardError) {
          enterManualFallback(error.code, error);
          return;
        }
        enterManualFallback("unexpected_error", error);
      }
    },
    [user.city, user.phone]
  );

  const submitSellerContent = useCallback(
    async (payload: {
      text?: string;
      imageDataUrl?: string | null;
      videoUrl?: string;
      voiceCapture?: boolean;
    }) => {
      if (!requireAuthForListing("/add")) return;

      if (payload.imageDataUrl) setSellerPreviewImage(payload.imageDataUrl);
      if (payload.videoUrl) {
        setSellerVideoUrl(payload.videoUrl);
        const vid = parseVideoUrl(payload.videoUrl);
        setSellerHasVideo(vid.hasVideo);
        if (vid.thumbnail && !payload.imageDataUrl) {
          setSellerPreviewImage(vid.thumbnail);
        }
      }

      const mode: SellerInputMode = payload.voiceCapture
        ? payload.imageDataUrl && payload.text
          ? "combined"
          : payload.imageDataUrl
            ? "upload"
            : "voice"
        : payload.imageDataUrl && payload.text
          ? "combined"
          : payload.imageDataUrl
            ? "upload"
            : "text";

      setSellerInputMode(mode);
      if (payload.text?.trim()) setSellerUserPrompt(payload.text.trim());
      await runAiProcessing(mode, {
        transcript: payload.text,
        previewImage: payload.imageDataUrl ?? parseVideoUrl(payload.videoUrl ?? "").thumbnail,
        videoUrl: payload.videoUrl,
      });
    },
    [runAiProcessing, requireAuthForListing]
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

    if (!isAuthenticated) {
      openAuthModal("/add");
      return;
    }

    if (!aiDraft.title.trim()) {
      setToast({ message: "Įveskite pavadinimą prieš publikuojant.", type: "error" });
      return;
    }

    if (aiDraft.price <= 0) {
      setToast({ message: "Įveskite kainą prieš publikuojant.", type: "error" });
      return;
    }

    const adaptiveKey = listingToAdaptiveKey(aiDraft.category);
    const missing = getMissingCriticalFields(adaptiveKey, aiDraft.attributes ?? {}, {
      price: aiDraft.price,
      description: aiDraft.description,
    });
    if (missing.length > 0) {
      setToast({
        message: `Užpildykite privalomus laukus: ${missing.slice(0, 3).join(", ")}`,
        type: "error",
      });
      return;
    }

    const priceSanity = evaluatePriceSanity(aiDraft.category, aiDraft.price);
    if (priceSanity.suspicious) {
      const priceDisplay = formatPriceForConfirm(aiDraft.price, aiDraft.priceLabel);
      logAiSafeguard("price_sanity_warning", {
        category: aiDraft.category,
        price: aiDraft.price,
        reason: priceSanity.reason,
      });
      const confirmed = await new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmDialog({
          title: "Patikrinkite kainą",
          message: `AI pastebėjo, kad kaina gali būti klaidinga. Ar tikrai norite skelbti su kaina: ${priceDisplay}?`,
          confirmLabel: "Taip, skelbti",
          cancelLabel: "Grįžti",
        });
      });
      if (!confirmed) {
        logAiSafeguard("price_sanity_cancelled", {
          category: aiDraft.category,
          price: aiDraft.price,
        });
        return;
      }
      logAiSafeguard("price_sanity_confirmed", {
        category: aiDraft.category,
        price: aiDraft.price,
      });
    }

    const mod = moderateListing(aiDraft);
    if (!mod.allowed) {
      setToast({ message: mod.reason ?? "Skelbimas atmestas moderacijos.", type: "error" });
      return;
    }

    if (isDuplicateListing(aiDraft.title, user.id, listings)) {
      setToast({
        message: "Panašus skelbimas jau egzistuoja. Atnaujinkite esamą arba pakeiskite pavadinimą.",
        type: "error",
      });
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
      priceLabel: aiDraft.priceLabel,
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
      published = withDefaultExpiry(createRes.data ?? newListing);
    }

    setListings((prev) => [published, ...prev]);
    setSellerStep("published");
    scheduleSellerEngagementPush(published.id, published.location, published.title);

    setTimeout(resetSellerFlow, 4000);
  }, [
    aiDraft,
    sellerPreviewImage,
    sellerHasVideo,
    resetSellerFlow,
    user,
    listings,
    buyerCoords,
    isAuthenticated,
    openAuthModal,
    scheduleSellerEngagementPush,
  ]);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" | "buddy" = "success") => {
      setToast({ message, type });
    },
    []
  );

  const clearToast = useCallback(() => setToast(null), []);

  const dismissConfirm = useCallback((confirmed: boolean) => {
    setConfirmDialog(null);
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
  }, []);

  const showConfirm = useCallback((opts: ConfirmDialogState) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(opts);
    });
  }, []);

  const setPushAlertsEnabled = useCallback((enabled: boolean) => {
    setPushAlertsEnabledState(enabled);
    savePushAlertsEnabled(enabled);
    if (enabled) {
      void requestNotificationPermission().then(() => {
        void registerWebPush(alertQueriesRef.current);
      });
    }
  }, []);

  const updateSellerMedia = useCallback(
    (patch: { imageDataUrl?: string | null; videoUrl?: string }) => {
      if (patch.imageDataUrl !== undefined) {
        setSellerPreviewImage(patch.imageDataUrl);
      }
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
    const wakePending = gdprWakeWordPending.current;
    gdprWakeWordPending.current = false;
    action?.();
    if (wakePending) {
      setWakeWordEnabledState(true);
      saveWakeWordEnabled(true);
      void requestNotificationPermission();
      logWakeEvent("enabled_after_consent");
    }
  }, []);

  const declineGdprConsent = useCallback(() => {
    setGdprModalOpen(false);
    gdprPendingAction.current = null;
    gdprWakeWordPending.current = false;
  }, []);

  const revokeGdprConsent = useCallback(() => {
    setGdprConsent(false);
    saveGdprConsent(false);
    wakeWordSessionRef.current?.stop();
    wakeWordSessionRef.current = null;
    setWakeWordEnabledState(false);
    saveWakeWordEnabled(false);
    setWakeWordPhase("off");
    stopBuddySpeech();
    logWakeEvent("disabled_via_gdpr_revoke");
  }, []);

  const disableWakeWordInstantly = useCallback(() => {
    wakeWordSessionRef.current?.stop();
    wakeWordSessionRef.current = null;
    setWakeWordEnabledState(false);
    saveWakeWordEnabled(false);
    setWakeWordPhase("off");
    setWakeWordTranscript(undefined);
    setWakeWordStatusText(undefined);
    stopBuddySpeech();
    logWakeEvent("disabled_instant");
    showToast("Budintis režimas išjungtas — mikrofonas neaktyvus", "info");
  }, [showToast]);

  const setWakeWordEnabled = useCallback((enabled: boolean) => {
    if (!enabled) {
      disableWakeWordInstantly();
      return;
    }
    setWakeWordEnabledState(true);
    saveWakeWordEnabled(true);
    void requestNotificationPermission();
    logWakeEvent("enabled");
  }, [disableWakeWordInstantly]);

  const requestWakeWordConsent = useCallback(() => {
    if (gdprConsent) {
      setWakeWordEnabled(true);
      return;
    }
    gdprWakeWordPending.current = true;
    setGdprModalOpen(true);
  }, [gdprConsent, setWakeWordEnabled]);

  const processWakeCommand = useCallback(
    (transcript: string) => {
      setWakeWordPhase("processing");
      setWakeWordTranscript(transcript);
      setWakeWordStatusText("Suprantu…");
      logWakeEvent("command_received", { transcript: transcript.slice(0, 120) });

      const intent = parseVoiceIntent(transcript, user.city || "Panevėžys");
      const result = executeVoiceIntent(intent, listingsRef.current);

      setWakeWordStatusText(result.response);
      logAnalytics("wake_word_detected", {
        intent: intent.type,
        matches: result.matchCount,
      });

      if (result.topListing && intent.type === "check_new_ads") {
        setSearchQuery(intent.topic);
      }

      speakBuddyMessage(result.response, {
        enabled: true,
        onEnd: () => {
          setWakeWordTranscript(undefined);
          setWakeWordStatusText(undefined);
          const session = wakeWordSessionRef.current;
          if (session) resumePassivePhase(session, setWakeWordPhase);
          else setWakeWordPhase("passive");
        },
      });

      if (result.topListing) {
        showToast(result.response, "buddy");
      }
    },
    [user.city, showToast]
  );

  useEffect(() => {
    if (!hydrated || !wakeWordEnabled || !gdprConsent) {
      wakeWordSessionRef.current?.stop();
      wakeWordSessionRef.current = null;
      if (!wakeWordEnabled) setWakeWordPhase("off");
      return;
    }

    const session = createWakeWordSession({
      onPhaseChange: setWakeWordPhase,
      onWake: () => {
        setWakeWordTranscript(undefined);
        setWakeWordStatusText(undefined);
      },
      onCommand: (transcript) => processWakeCommand(transcript),
      onError: (message) => {
        logWakeEvent("session_error", { message });
        if (message === "not-allowed") {
          disableWakeWordInstantly();
          showToast("Mikrofono prieiga atmesta", "error");
        }
      },
    });

    wakeWordSessionRef.current = session;
    session.start();
    logWakeEvent("session_started");

    return () => {
      session.stop();
      wakeWordSessionRef.current = null;
    };
  }, [
    hydrated,
    wakeWordEnabled,
    gdprConsent,
    processWakeCommand,
    disableWakeWordInstantly,
    showToast,
  ]);

  useEffect(() => {
    if (!hydrated || !pushAlertsEnabled) return;

    const buildQueries = () => {
      const fromIntent = searchIntentRef.current
        .slice(0, 8)
        .map((e) => e.query);
      const q = searchQueryRef.current.trim();
      const merged = [
        ...alertQueriesRef.current,
        ...fromIntent,
        ...(q.length >= 3 ? [q] : []),
      ];
      const unique = [...new Set(merged.map((s) => s.trim().toLowerCase()))].filter(
        (s) => s.length >= 3
      );
      alertQueriesRef.current = unique;
      saveAlertQueries(unique);
      return unique;
    };

    const stopPoll = startPushAlertPolling(
      () => listingsRef.current,
      buildQueries,
      (payload: PushAlertPayload) => {
        pushAlertsSeenRef.current.add(payload.listingId);
        savePushAlertsSeen(Array.from(pushAlertsSeenRef.current));
        void showLocalPushNotification(payload);
        if (payload.voiceText) {
          speakBuddyMessage(payload.voiceText, { enabled: true });
        }
        setToast({ message: payload.body, type: "info" });
      },
      pushAlertsSeenRef.current
    );

    return stopPoll;
  }, [hydrated, pushAlertsEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    const q = searchQuery.trim();
    if (q.length < 3) return;
    const next = [...new Set([...alertQueriesRef.current, q.toLowerCase()])];
    alertQueriesRef.current = next;
    saveAlertQueries(next);
  }, [searchQuery, hydrated]);

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
  }, [aiDraft, sellerStep]);

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
    if (!requireAuthForListing("/add")) return;
    requestMediaConsent(async () => {
      const photo = await capturePhoto();
      if (!photo) return;

      setSellerPreviewImage(photo);
      setSellerInputMode("upload");
      await runAiProcessing("upload", { previewImage: photo });
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

  const sendMessage = useCallback(
    (chatId: string, text: string) => {
      const msg: ChatMessage = {
        id: `m-${Date.now()}`,
        senderId: user.id,
        text,
        timestamp: new Date().toISOString(),
      };

      let buyerId = "";
      let sellerId = "";
      let listingTitle = "";

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;

          buyerId = chat.buyerId;
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
        if (user.id !== buyerId) return;

        const replyId = `m-${Date.now()}`;
        const reply: ChatMessage = {
          id: replyId,
          senderId: "vauto-system",
          text: "Žinutė išsiųsta pardavėjui. Atsakymą matysite šiame pokalbyje.",
          timestamp: new Date().toISOString(),
        };

        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: [...c.messages, reply] }
              : c
          )
        );

        if (sellerId) {
          scheduleIncomingSms(chatId, replyId, sellerId, listingTitle);
        }
      }, 1500);
    },
    [user.id, scheduleIncomingSms]
  );

  const startChat = useCallback(
    (listingId: string): string | null => {
      const listing = listings.find((l) => l.id === listingId);
      if (!listing) return null;
      if (listing.sellerId === user.id) return null;

      if (!isAuthenticated) {
        openAuthModal(listingPath(listing));
        return null;
      }

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
      bumpListingById(listingId, "chatStarts");
      logAnalytics("listing_chat_start", {
        listingId,
        title: listing.title,
        sellerId: listing.sellerId,
      });
      if (isDataApiEnabled()) {
        void apiUpsertChat(newChat, user.id).then((r) => {
          if (!r.ok) setSyncError(`Pokalbis neišsaugotas: ${r.error}`);
        });
      }
      return chatId;
    },
    [listings, chats, user.id, isAuthenticated, openAuthModal, bumpListingById]
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

  const topUpWallet = useCallback(
    (amount: number) => {
      if (apiActive) {
        void apiTopUpWallet(amount).then((r) => {
          if (r.ok) {
            patchAuthUser({ walletBalance: r.data.walletBalance });
          } else {
            setSyncError(`Piniginė neišsaugota: ${r.error}`);
          }
        });
        return;
      }
      patchAuthUser({ walletBalance: (user.walletBalance ?? 0) + amount });
    },
    [patchAuthUser, user.walletBalance, apiActive]
  );

  const updateListing = useCallback(
    (id: string, patch: ListingEditPatch) => {
      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== id || l.sellerId !== user.id) return l;
          const next = { ...l, ...patch };
          if (patch.location !== undefined || patch.title !== undefined) {
            return enrichListingCoords({
              ...next,
              slug: generateListingSlug(
                patch.title ?? l.title,
                patch.location ?? l.location
              ),
            });
          }
          return next;
        })
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
    (id: string) => {
      const listing = listings.find((l) => l.id === id);
      updateListing(id, { status: "sold" });
      patchAuthUser({ soldCount: (user.soldCount ?? 0) + 1 });
      setSoldPromptDismissed((prev) => new Set([...prev, id]));
      logAnalytics("listing_marked_sold", {
        listingId: id,
        title: listing?.title,
        sellerId: user.id,
      });
    },
    [updateListing, listings, user.id, user.soldCount, patchAuthUser]
  );

  const handleSubmitReview = useCallback(
    (data: {
      listingId: string;
      listingTitle: string;
      sellerId: string;
      rating: number;
      comment?: string;
    }) => {
      submitReview(data);
      setPendingReview(null);
    },
    [submitReview]
  );

  const dismissSoldPrompt = useCallback((listingId: string) => {
    setSoldPromptDismissed((prev) => new Set([...prev, listingId]));
  }, []);

  const promoteListing = useCallback(
    (listingId: string, cost: number): boolean => {
      const balance = user.walletBalance ?? 0;
      if (balance < cost) return false;

      if (apiActive) {
        void apiPromoteListing(listingId, cost).then((r) => {
          if (r.ok) {
            patchAuthUser({ walletBalance: r.data.walletBalance });
            setListings((prev) =>
              prev.map((l) =>
                l.id === listingId ? { ...l, ...r.data.listing, promoted: true } : l
              )
            );
          } else {
            setSyncError(`Promote nepavyko: ${r.error}`);
          }
        });
      }

      patchAuthUser({ walletBalance: balance - cost });
      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== listingId) return l;
          const m = mockListingMetrics(l);
          return {
            ...l,
            promoted: true,
            views: m.views + 150,
            callClicks: m.callClicks + 20,
            interestScore: Math.min(99, m.interestScore + 12),
          };
        })
      );
      return true;
    },
    [user.walletBalance, apiActive, patchAuthUser]
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
          patchAuthUser({ warned: true });
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
    setSearchQuery: handleSearchQuery,
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
    sellerUserPrompt,
    searchVoiceMode,
    setSearchVoiceMode,
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
    submitSellerContent,
    startListingFromQuery,
    pendingSellerQuery,
    consumePendingSellerQuery,
    chats,
    sendMessage,
    startChat,
    updateEscrow,
    isAuthenticated,
    authModalOpen,
    authRedirectPath,
    openAuthModal,
    closeAuthModal,
    clearAuthRedirect,
    requireAuthForListing,
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
    reviews,
    submitReview: handleSubmitReview,
    trackListingView,
    trackListingCall,
    popularListingIds,
    recentSoldStories,
    buyerIntentCount,
    soldPromptDismissed,
    dismissSoldPrompt,
    sellerAnalytics,
    pendingReview,
    queueReviewPrompt,
    clearReviewPrompt,
    wakeWordEnabled,
    wakeWordPhase,
    wakeWordStatusText,
    wakeWordTranscript,
    setWakeWordEnabled,
    requestWakeWordConsent,
    disableWakeWordInstantly,
    pushAlertsEnabled,
    setPushAlertsEnabled,
    confirmDialog,
    showConfirm,
    dismissConfirm,
    chameleonTheme,
    detectedAdaptiveKey,
  };

  return (
    <VautoContext.Provider value={value}>
      {children}
      <ChameleonThemeHost />
      <ReviewPromptHost />
      <WakeWordHost />
      <GdprConsentModal
        open={gdprModalOpen}
        onAccept={acceptGdprConsent}
        onDecline={declineGdprConsent}
      />
      <ConfirmDialog />
    </VautoContext.Provider>
  );
}

export function useVauto() {
  const ctx = useContext(VautoContext);
  if (!ctx) throw new Error("useVauto must be used within VautoProvider");
  return ctx;
}

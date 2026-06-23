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
import { INITIAL_LISTINGS } from "@/data/mockListings";
import { mergeApiWithDemoCatalog } from "@/lib/merge-listings";
import {
  portalRankedListings,
  portalThemeForQuery,
  sanitizeSearchQuery,
} from "@/lib/portal-listing-filter";
import {
  generateDynamicFilters,
  rankListings,
  resolveSortMode,
} from "@/lib/scoring";
import { defaultExpiresAt, isListingActive, withDefaultExpiry } from "@/lib/listing-expiry";
import { apiVisualRank, apiSemanticSearch, apiImageSearch, apiSubscribeB2BPlan, apiBillingPortal } from "@/lib/api/client";
import {
  type VisualSearchProfile,
  mergeRankScores,
} from "@/lib/visual-search";
import {
  loadAuthSession,
  loadGdprConsent,
  loadListings,
  loadSavedIds,
  loadOpenedServiceLeads,
  loadSearchIntent,
  loadServiceLeads,
  loadSoldPromptDismissed,
  loadUser,
  saveGdprConsent,
  saveListings,
  saveOpenedServiceLeads,
  saveSavedIds,
  saveSearchIntent,
  saveServiceLeads,
  saveSoldPromptDismissed,
} from "@/lib/storage";
import { distanceToCity, getUserCoords, type UserCoords } from "@/lib/geolocation";
import {
  distanceToListing,
  enrichListingCoords,
} from "@/lib/geocoding";
import { normalizeListings } from "@/lib/listing-normalize";
import { generateListingSlug, listingPath } from "@/lib/seo";
import {
  apiDeleteListing,
  apiCreateServiceLead,
  apiFetchListings,
  apiFetchSaved,
  apiFetchServiceLeads,
  apiFetchUser,
  apiHealthCheck,
  apiOpenServiceLead,
  apiRenewListing,
  apiUpdateListing,
  apiUpdateSaved,
  apiUpdateUser,
} from "@/lib/api/client";
import { isDataApiEnabled, initDataApiConfig } from "@/lib/api/config";
import type {
  AiExtractedListing,
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
import {
  buildVisibilityAttributes,
  getVisibilityPlanById,
  type VisibilityTierId,
} from "@/lib/visibility-plans";
import { bumpListingMetric, aggregateSellerMetrics } from "@/lib/listing-analytics";
import {
  countBuyerIntentForSeller,
  getPopularListingIds,
  recordSearchIntent,
  type SearchIntentEvent,
} from "@/lib/search-intent";
import {
  buildServiceLeadFromQuery,
  isServiceDemandQuery,
  leadPriceForCoverage,
  mergeServiceLeads,
  type ServiceLead,
} from "@/lib/service-leads";
import { GdprConsentModal } from "@/components/privacy/GdprConsentModal";
import { useAuth, type LoginPayload } from "@/context/AuthContext";
import { useReviews } from "@/context/ReviewsContext";
import { ChatProvider, useChat } from "@/context/ChatContext";
import { SellerFlowContextProvider, useSellerFlow, type SellerFlowContextValue } from "@/context/SellerFlowContext";
import { SellerFlowOverlays } from "@/components/SellerFlowOverlays";
import { VautoBridgeProvider, type VautoBridgeValue } from "@/context/VautoBridge";
import { apiTopUpWallet, apiPromoteListing } from "@/lib/api/wallet-reviews";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { logAnalytics } from "@/lib/analytics";
import { ReviewPromptHost } from "@/components/reviews/ReviewPromptHost";
import {
  buildBuddySoldFollowUp,
} from "@/lib/buddy-messages";
import {
  type ChameleonThemeId,
} from "@/lib/chameleon-themes";
import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WakeWordHost } from "@/components/voice/WakeWordHost";
import { ChameleonThemeHost } from "@/components/theme/ChameleonThemeHost";
import type { WakeWordPhase } from "@/lib/wake-word-types";
import {
  WakeWordProvider,
  useWakeWord,
  type WakeWordActions,
  type WakeWordDeps,
} from "@/context/WakeWordContext";
import {
  ModerationProvider,
  useModeration,
  type ModerationDeps,
} from "@/context/ModerationContext";
import {
  PushAlertsProvider,
  usePushAlerts,
  type PushAlertsDeps,
} from "@/context/PushAlertsContext";

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
  apiActive: boolean;

  sellerStep: SellerFlowStep;
  sellerInputMode: SellerInputMode;
  sellerUserPrompt: string | null;
  searchVoiceMode: boolean;
  setSearchVoiceMode: (voice: boolean) => void;
  searchInputMode: import("@/lib/buddy-messages").SearchInputMode;
  setSearchInputMode: (mode: import("@/lib/buddy-messages").SearchInputMode) => void;
  visualSearchProfile: VisualSearchProfile | null;
  visualRankScores: Record<string, number>;
  visualSearchRefining: boolean;
  clearVisualSearch: (opts?: { keepInputMode?: boolean }) => void;
  applyVisualSearch: (profile: VisualSearchProfile) => Promise<void>;
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
    imageDataUrls?: string[];
    extraContext?: string;
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
  subscribeB2BPlan: (planId: "starter" | "pro") => Promise<boolean>;
  openBillingPortal: () => Promise<boolean>;
  promoteListing: (listingId: string, cost: number, tierId: VisibilityTierId) => boolean;
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
  replyToReport: (reportId: string, text: string, options?: { auto?: boolean }) => void;
  followUpReport: (reportId: string, text: string) => void;
  markReportRead: (reportId: string) => void;
  markMyReportRead: (reportId: string) => void;
  refreshReports: () => Promise<SupportReport[]>;
  refreshMyReports: () => Promise<SupportReport[]>;
  myReports: SupportReport[];
  unreadAdminCount: number;
  unreadUserReportCount: number;
  reportStreamConnected: boolean;
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
  serviceLeads: ServiceLead[];
  openedServiceLeadIds: Set<string>;
  registerServiceLead: (query: string) => void;
  openServiceLead: (leadId: string) => boolean;
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
  wishlistQueries: string[];
  subscribeWishlist: (query: string) => Promise<boolean>;
  unsubscribeWishlist: (query: string) => void;
  isWishlistSubscribed: (query: string) => boolean;

  confirmDialog: ConfirmDialogState | null;
  showConfirm: (opts: ConfirmDialogState) => Promise<boolean>;
  dismissConfirm: (confirmed: boolean) => void;

  chameleonTheme: ChameleonThemeId;
  detectedAdaptiveKey: AdaptiveCategoryKey | null;
}

type VautoCatalogSlice = Omit<
  VautoContextValue,
  | keyof SellerFlowContextValue
  | "chats"
  | "sendMessage"
  | "startChat"
  | "updateEscrow"
  | "setActiveChatId"
  | "markChatRead"
  | "findListing"
  | "wakeWordEnabled"
  | "wakeWordPhase"
  | "wakeWordStatusText"
  | "wakeWordTranscript"
  | "setWakeWordEnabled"
  | "requestWakeWordConsent"
  | "disableWakeWordInstantly"
  | "reports"
  | "bannedUserIds"
  | "submitReport"
  | "warnFromReport"
  | "banFromReport"
  | "resolveReport"
  | "replyToReport"
  | "followUpReport"
  | "markReportRead"
  | "markMyReportRead"
  | "refreshReports"
  | "refreshMyReports"
  | "myReports"
  | "unreadAdminCount"
  | "unreadUserReportCount"
  | "reportStreamConnected"
  | "pushAlertsEnabled"
  | "setPushAlertsEnabled"
  | "wishlistQueries"
  | "subscribeWishlist"
  | "unsubscribeWishlist"
  | "isWishlistSubscribed"
  | "rankedListings"
  | "popularListingIds"
>;

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

function VautoFacade({
  catalog,
  children,
  gdprModalOpen,
  acceptGdprConsent,
  declineGdprConsent,
}: {
  catalog: VautoCatalogSlice;
  children: ReactNode;
  gdprModalOpen: boolean;
  acceptGdprConsent: () => void;
  declineGdprConsent: () => void;
}) {
  const chat = useChat();
  const seller = useSellerFlow();
  const wakeWord = useWakeWord();
  const moderation = useModeration();
  const pushAlerts = usePushAlerts();

  const visibleListings = useMemo(
    () =>
      catalog.listings.filter(
        (l) => !l.banned && !moderation.bannedUserIds.has(l.sellerId)
      ),
    [catalog.listings, moderation.bannedUserIds]
  );

  const rankedListings = useMemo(() => {
    let results = rankListings(
      visibleListings,
      catalog.searchQuery,
      resolveSortMode(catalog.activeFilterIds),
      {
        visualProfile: catalog.visualSearchProfile,
        visualRankScores: catalog.visualRankScores,
      }
    );

    if (catalog.activeFilterIds.size > 0) {
      const activeFilters = catalog.dynamicFilters.filter((f) =>
        catalog.activeFilterIds.has(f.id)
      );
      const sortOnly = new Set([
        "newest",
        "cheapest",
        "closest",
        "budget",
        "cheap-service",
      ]);
      const predicateFilters = activeFilters.filter(
        (f) => !sortOnly.has(f.id)
      );
      if (predicateFilters.length > 0) {
        results = results.filter((l) =>
          predicateFilters.every((f) => f.apply(l))
        );
      }
    }

    const q = catalog.searchQuery.trim();
    if (q && portalThemeForQuery(q) !== "flux") {
      results = portalRankedListings(q, results);
    }

    return results;
  }, [
    visibleListings,
    catalog.searchQuery,
    catalog.activeFilterIds,
    catalog.dynamicFilters,
    catalog.visualSearchProfile,
    catalog.visualRankScores,
  ]);

  const popularListingIds = useMemo(
    () => getPopularListingIds(visibleListings, 4),
    [visibleListings]
  );

  const value = useMemo<VautoContextValue>(
    () => ({
      ...catalog,
      ...chat,
      ...seller,
      ...wakeWord,
      ...moderation,
      ...pushAlerts,
      rankedListings,
      popularListingIds,
    }),
    [
      catalog,
      chat,
      seller,
      wakeWord,
      moderation,
      pushAlerts,
      rankedListings,
      popularListingIds,
    ]
  );

  return (
    <VautoContext.Provider value={value}>
      {children}
      <SellerFlowOverlays />
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
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info" | "buddy";
  } | null>(null);
  const [buyerCoords, setBuyerCoords] = useState<UserCoords | null>(null);
  const [gdprConsent, setGdprConsent] = useState(false);
  const [gdprModalOpen, setGdprModalOpen] = useState(false);
  const [searchIntentEvents, setSearchIntentEvents] = useState<SearchIntentEvent[]>([]);
  const [liveServiceLeads, setLiveServiceLeads] = useState<ServiceLead[]>([]);
  const [openedServiceLeadIds, setOpenedServiceLeadIds] = useState<Set<string>>(new Set());
  const [soldPromptDismissed, setSoldPromptDismissed] = useState<Set<string>>(new Set());
  const [pendingReview, setPendingReview] = useState<PendingReviewPrompt | null>(null);
  const [searchVoiceMode, setSearchVoiceMode] = useState(false);
  const [searchInputMode, setSearchInputMode] =
    useState<import("@/lib/buddy-messages").SearchInputMode>(null);
  const [visualSearchProfile, setVisualSearchProfile] =
    useState<VisualSearchProfile | null>(null);
  const [visualRankScores, setVisualRankScores] = useState<Record<string, number>>({});
  const [visualSearchRefining, setVisualSearchRefining] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [chameleonTheme, setChameleonTheme] = useState<ChameleonThemeId>("flux");
  const [detectedAdaptiveKey, setDetectedAdaptiveKey] =
    useState<AdaptiveCategoryKey | null>(null);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buddyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewedListingsRef = useRef<Set<string>>(new Set());
  const gdprPendingAction = useRef<(() => void) | null>(null);
  const gdprWakeWordPending = useRef(false);
  const wakeWordActionsRef = useRef<WakeWordActions | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;

  useEffect(() => {
    async function load() {
      await initDataApiConfig();
      if (isDataApiEnabled() && (await apiHealthCheck())) {
        setApiActive(true);
        const storedUser = loadUser();
        const auth = loadAuthSession();
        const hasAuthUser = Boolean(storedUser?.id && auth?.isAuthenticated);
        const listingsRes = await apiFetchListings();
        const [savedRes, userRes, leadsRes] = hasAuthUser
          ? await Promise.all([
              apiFetchSaved(storedUser!.id),
              apiFetchUser(storedUser!.id),
              apiFetchServiceLeads(),
            ])
          : [null, null, null];

        const errors: string[] = [];
        if (listingsRes.ok) {
          const fromApi = listingsRes.data.map(withDefaultExpiry);
          setListings(
            normalizeListings(
              mergeApiWithDemoCatalog(fromApi, INITIAL_LISTINGS)
            )
          );
        } else errors.push(listingsRes.error);
        if (savedRes?.ok) setSavedIds(new Set(savedRes.data));
        else if (savedRes) errors.push(savedRes.error);
        if (userRes?.ok && auth?.isAuthenticated) {
          patchAuthUser(userRes.data);
        } else if (storedUser && auth?.isAuthenticated) {
          patchAuthUser({ role: "private", walletBalance: 0, ...storedUser });
        }
        if (leadsRes?.ok) {
          setLiveServiceLeads(leadsRes.data);
          setOpenedServiceLeadIds(
            new Set(
              leadsRes.data
                .filter((lead) => Boolean(lead.contactPhone))
                .map((lead) => lead.id)
            )
          );
        } else {
          const storedLeads = loadServiceLeads();
          if (storedLeads?.length) setLiveServiceLeads(storedLeads);
          const storedOpened = loadOpenedServiceLeads();
          if (storedOpened?.length) setOpenedServiceLeadIds(new Set(storedOpened));
        }

        if (errors.length) setSyncError(errors[0]);
        const storedIntent = loadSearchIntent();
        if (storedIntent) setSearchIntentEvents(storedIntent);
        const storedDismissed = loadSoldPromptDismissed();
        if (storedDismissed) setSoldPromptDismissed(new Set(storedDismissed));
        setGdprConsent(loadGdprConsent());
        setHydrated(true);
        return;
      }

      setApiActive(false);
      const storedUser = loadUser();
      const auth = loadAuthSession();
      const storedListings = loadListings();
      const storedSaved = loadSavedIds();
      if (auth?.isAuthenticated && storedUser) {
        patchAuthUser({ role: "private", walletBalance: 0, ...storedUser });
      }
      if (storedListings?.length) {
        setListings(normalizeListings(storedListings));
      }
      if (storedSaved) setSavedIds(new Set(storedSaved));
      const storedIntent = loadSearchIntent();
      if (storedIntent) setSearchIntentEvents(storedIntent);
      const storedDismissed = loadSoldPromptDismissed();
      if (storedDismissed) setSoldPromptDismissed(new Set(storedDismissed));
      const storedLeads = loadServiceLeads();
      if (storedLeads?.length) setLiveServiceLeads(storedLeads);
      const storedOpened = loadOpenedServiceLeads();
      if (storedOpened?.length) setOpenedServiceLeadIds(new Set(storedOpened));
      setGdprConsent(loadGdprConsent());
      setHydrated(true);
    }
    void load();
  }, [patchAuthUser]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      const clean = sanitizeSearchQuery(q);
      if (clean) setSearchQuery(clean);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveListings(listings);
  }, [listings, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSavedIds(savedIds);
  }, [savedIds, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveServiceLeads(liveServiceLeads);
  }, [liveServiceLeads, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveOpenedServiceLeads([...openedServiceLeadIds]);
  }, [openedServiceLeadIds, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSearchIntent(searchIntentEvents);
  }, [searchIntentEvents, hydrated, apiActive]);

  useEffect(() => {
    if (!hydrated || apiActive) return;
    saveSoldPromptDismissed(Array.from(soldPromptDismissed));
  }, [soldPromptDismissed, hydrated, apiActive]);

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

  const serviceLeads = useMemo(
    () => mergeServiceLeads(liveServiceLeads, { includeDemo: true }),
    [liveServiceLeads]
  );

  const registerServiceLead = useCallback(
    (query: string) => {
      const lead = buildServiceLeadFromQuery(query, {
        userId: user.id,
        contactPhone: user.phone,
        defaultCity: user.city?.split(",")[0],
      });
      if (!lead) return;

      const addLead = (item: ServiceLead) => {
        setLiveServiceLeads((prev) => {
          const recentDuplicate = prev.some(
            (entry) =>
              entry.query?.toLowerCase() === item.query?.toLowerCase() &&
              Date.now() - new Date(entry.createdAt).getTime() < 60 * 60 * 1000
          );
          if (recentDuplicate) return prev;
          return [item, ...prev].slice(0, 50);
        });
      };

      if (apiActive && isDataApiEnabled()) {
        void apiCreateServiceLead(lead).then((res) => {
          if (res.ok) addLead(res.data);
          else addLead(lead);
        });
        return;
      }

      addLead(lead);
    },
    [user.id, user.phone, user.city, apiActive]
  );

  const openServiceLead = useCallback(
    (leadId: string): boolean => {
      const lead = serviceLeads.find((l) => l.id === leadId);
      if (!lead) return false;
      if (openedServiceLeadIds.has(leadId)) return true;

      const price = leadPriceForCoverage(lead.leadPrice, {
        radiusKm: user.serviceRadiusKm,
        nationwide: user.serviceNationwide,
        topRatedPlus: false,
      });
      const balance = user.walletBalance ?? 0;
      if (balance < price) return false;

      patchAuthUser({ walletBalance: balance - price });
      setOpenedServiceLeadIds((prev) => new Set([...prev, leadId]));
      setLiveServiceLeads((prev) =>
        prev.map((item) =>
          item.id === leadId
            ? { ...item, contactPhone: item.contactPhone ?? lead.contactPhone }
            : item
        )
      );

      if (apiActive && isDataApiEnabled() && lead.source === "buyer") {
        void apiOpenServiceLead(leadId, price).then((res) => {
          if (!res.ok) {
            patchAuthUser({ walletBalance: balance });
            setOpenedServiceLeadIds((prev) => {
              const next = new Set(prev);
              next.delete(leadId);
              return next;
            });
            setSyncError(`Lead atidarymas nepavyko: ${res.error}`);
            return;
          }
          patchAuthUser({ walletBalance: res.data.walletBalance });
          if (res.data.lead.contactPhone) {
            setLiveServiceLeads((prev) =>
              prev.map((item) =>
                item.id === leadId
                  ? { ...item, contactPhone: res.data.lead.contactPhone }
                  : item
              )
            );
          }
        });
      }

      return true;
    },
    [
      serviceLeads,
      openedServiceLeadIds,
      user.walletBalance,
      user.serviceRadiusKm,
      user.serviceNationwide,
      patchAuthUser,
      apiActive,
    ]
  );

  const handleSearchQuery = useCallback(
    (q: string) => {
      const clean = sanitizeSearchQuery(q);
      setSearchQuery(clean);
      if (clean.length >= 2) {
        setSearchIntentEvents((prev) => recordSearchIntent(prev, clean));
      }
      if (isServiceDemandQuery(clean)) {
        registerServiceLead(clean);
      }
    },
    [registerServiceLead]
  );

  const clearVisualSearch = useCallback((opts?: { keepInputMode?: boolean }) => {
    setVisualSearchProfile(null);
    setVisualRankScores({});
    setVisualSearchRefining(false);
    if (!opts?.keepInputMode) setSearchInputMode(null);
  }, []);

  const applyVisualSearch = useCallback(
    async (profile: VisualSearchProfile) => {
      setVisualSearchProfile(profile);
      setVisualRankScores({});
      setVisualSearchRefining(true);
      try {
        const candidates = listings
          .filter((l) => !l.banned && isListingActive(l))
          .sort((a, b) => {
            if (a.category === profile.category && b.category !== profile.category) return -1;
            if (b.category === profile.category && a.category !== profile.category) return 1;
            return 0;
          })
          .slice(0, 40)
          .map((l) => ({
            id: l.id,
            title: l.title,
            category: l.category,
            price: l.price,
            location: l.location,
          }));

        if (!candidates.length) return;

        const hasPhoto = Boolean(profile.previewImage);
        const imageCandidates = hasPhoto
          ? listings
              .filter((l) => !l.banned && isListingActive(l) && l.image)
              .slice(0, 40)
              .map((l) => ({
                id: l.id,
                image: l.image,
              }))
          : [];

        const [visualRank, semantic, imageRank] = await Promise.all([
          apiVisualRank({ profile, candidates }),
          apiSemanticSearch({ profile, limit: 40 }),
          hasPhoto && profile.previewImage
            ? apiImageSearch({
                imageDataUrl: profile.previewImage,
                candidates: imageCandidates,
                limit: 40,
              })
            : Promise.resolve(null),
        ]);

        const merged = mergeRankScores(
          hasPhoto
            ? [
                { weight: 0.25, scores: visualRank?.scores },
                { weight: 0.4, scores: semantic?.scores },
                { weight: 0.35, scores: imageRank?.scores },
              ]
            : [
                { weight: 0.4, scores: visualRank?.scores },
                { weight: 0.6, scores: semantic?.scores },
              ]
        );

        if (Object.keys(merged).length) setVisualRankScores(merged);
        else if (visualRank?.scores) setVisualRankScores(visualRank.scores);
      } finally {
        setVisualSearchRefining(false);
      }
    },
    [listings]
  );

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
      wakeWordActionsRef.current?.enableAfterGdprConsent();
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
    wakeWordActionsRef.current?.disableOnGdprRevoke();
  }, []);

  const requestGdprModalForWake = useCallback(() => {
    gdprWakeWordPending.current = true;
    setGdprModalOpen(true);
  }, []);
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

  const subscribeB2BPlan = useCallback(
    async (planId: "starter" | "pro") => {
      if (apiActive) {
        const r = await apiSubscribeB2BPlan(planId);
        if (r.ok) {
          if (r.data.checkoutUrl) {
            window.location.href = r.data.checkoutUrl;
            return true;
          }
          const u = r.data.user;
          if (u) {
            patchAuthUser({
              billingPlan:
                (u.billingPlan as UserProfile["billingPlan"]) ?? planId,
              role:
                u.role === "pro" || planId === "pro" ? "pro" : user.role,
            });
          }
          if (r.data.message) showToast(r.data.message, "success");
          return true;
        }
        showToast(r.error, "error");
        return false;
      }
      patchAuthUser({
        billingPlan: planId,
        role: planId === "pro" ? "pro" : user.role,
      });
      showToast(
        planId === "pro"
          ? "Pro planas aktyvuotas (demo)"
          : "Starto planas užregistruotas (demo)",
        "success"
      );
      return true;
    },
    [apiActive, patchAuthUser, showToast, user.role]
  );

  const openBillingPortal = useCallback(async () => {
    if (!apiActive) {
      showToast("Stripe portalas pasiekiamas tik su Live API", "info");
      return false;
    }
    const r = await apiBillingPortal();
    if (r.ok && r.data.portalUrl) {
      window.location.href = r.data.portalUrl;
      return true;
    }
    showToast(r.ok ? "Portalas nepasiekiamas" : r.error, "error");
    return false;
  }, [apiActive, showToast]);

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
    (listingId: string, cost: number, tierId: VisibilityTierId): boolean => {
      const balance = user.walletBalance ?? 0;
      if (balance < cost) return false;

      const listing = listings.find((l) => l.id === listingId);
      if (!listing) return false;

      const plan = getVisibilityPlanById(tierId, listing, listings, user);
      if (!plan?.available || plan.price !== cost) return false;

      const attrs = buildVisibilityAttributes(
        tierId,
        plan.durationDays,
        listing.attributes
      );
      const expiresAt = attrs?.["_visibilityExpiresAt"] as string | undefined;

      if (apiActive) {
        void apiPromoteListing(listingId, cost, tierId).then((r) => {
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
            visibilityTier: tierId,
            visibilityExpiresAt: expiresAt,
            attributes: attrs,
            views: m.views + 50 * tierId,
            callClicks: m.callClicks + 5 * tierId,
            interestScore: Math.min(99, m.interestScore + 4 * tierId),
          };
        })
      );
      return true;
    },
    [user, listings, apiActive, patchAuthUser]
  );

  const onBanListing = useCallback((listingId: string) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, banned: true } : l))
    );
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  const onBanSeller = useCallback((sellerId: string) => {
    setListings((prev) =>
      prev.map((l) => (l.sellerId === sellerId ? { ...l, banned: true } : l))
    );
  }, []);

  const onAlertToast = useCallback((message: string) => {
    setToast({ message, type: "info" });
  }, []);

  const catalogValue = useMemo(
    (): VautoCatalogSlice => ({
      user,
      updateUser,
      listings,
      savedIds,
      searchQuery,
      setSearchQuery: handleSearchQuery,
      activeFilterIds,
      toggleFilter,
      dynamicFilters,
      toggleSave,
      deleteListing,
      renewListing,
      syncError,
      clearSyncError,
      apiActive,
      searchVoiceMode,
      setSearchVoiceMode,
      searchInputMode,
      setSearchInputMode,
      visualSearchProfile,
      visualRankScores,
      visualSearchRefining,
      clearVisualSearch,
      applyVisualSearch,
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
      subscribeB2BPlan,
      openBillingPortal,
      promoteListing,
      updateListing,
      markListingSold,
      isAdmin,
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
      reviews,
      submitReview: handleSubmitReview,
      trackListingView,
      trackListingCall,
      recentSoldStories,
      buyerIntentCount,
      soldPromptDismissed,
      dismissSoldPrompt,
      sellerAnalytics,
      serviceLeads,
      openedServiceLeadIds,
      registerServiceLead,
      openServiceLead,
      pendingReview,
      queueReviewPrompt,
      clearReviewPrompt,
      confirmDialog,
      showConfirm,
      dismissConfirm,
      chameleonTheme,
      detectedAdaptiveKey,
    }),
    [
      user,
      updateUser,
      listings,
      savedIds,
      searchQuery,
      handleSearchQuery,
      activeFilterIds,
      toggleFilter,
      dynamicFilters,
      toggleSave,
      deleteListing,
      renewListing,
      syncError,
      clearSyncError,
      apiActive,
      searchVoiceMode,
      searchInputMode,
      visualSearchProfile,
      visualRankScores,
      visualSearchRefining,
      clearVisualSearch,
      applyVisualSearch,
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
      subscribeB2BPlan,
      openBillingPortal,
      promoteListing,
      updateListing,
      markListingSold,
      isAdmin,
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
      reviews,
      handleSubmitReview,
      trackListingView,
      trackListingCall,
      recentSoldStories,
      buyerIntentCount,
      soldPromptDismissed,
      dismissSoldPrompt,
      sellerAnalytics,
      serviceLeads,
      openedServiceLeadIds,
      registerServiceLead,
      openServiceLead,
      pendingReview,
      queueReviewPrompt,
      clearReviewPrompt,
      confirmDialog,
      showConfirm,
      dismissConfirm,
      chameleonTheme,
      detectedAdaptiveKey,
    ]
  );

  const bridgeValue = useMemo<VautoBridgeValue>(
    () => ({
      listings,
      setListings,
      bumpListingById,
      buyerCoords,
      apiActive,
      hydrated,
      setSyncError,
      showToast,
      showConfirm,
      requestMediaConsent,
      requireAuthForListing,
      openAuthModal,
      scheduleSellerEngagementPush,
      setDetectedAdaptiveKey,
      setChameleonTheme,
    }),
    [
      listings,
      bumpListingById,
      buyerCoords,
      apiActive,
      hydrated,
      showToast,
      showConfirm,
      requestMediaConsent,
      requireAuthForListing,
      openAuthModal,
      scheduleSellerEngagementPush,
    ]
  );

  const handleNewAdminReport = useCallback(
    (report: SupportReport) => {
      const cat =
        report.category === "fraud"
          ? "Sukčiavimas"
          : report.category === "technical_issue"
            ? "Techninė problema"
            : "Pranešimas";
      showToast(`Naujas pranešimas: ${report.reporterName} — ${cat}`, "info");
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const notification = new Notification("Vauto — naujas pranešimas", {
            body: report.comment.slice(0, 140),
            tag: report.id,
          });
          notification.onclick = () => {
            window.focus();
            window.location.href = `/profile/?report=${encodeURIComponent(report.id)}`;
          };
        }
      }
    },
    [showToast]
  );

  const handleNewUserReportReply = useCallback(
    (report: SupportReport, preview: string) => {
      showToast("Gavote atsakymą į pranešimą", "info");
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          const notification = new Notification("Vauto — atsakymas į pranešimą", {
            body: preview.slice(0, 140),
            tag: `reply-${report.id}`,
          });
          notification.onclick = () => {
            window.focus();
            window.location.href = `/profile/?support=${encodeURIComponent(report.id)}`;
          };
        }
      }
    },
    [showToast]
  );

  const moderationDeps = useMemo<ModerationDeps>(
    () => ({
      listingsRef,
      onBanListing,
      onBanSeller,
      setSyncError,
      showToast,
      patchAuthUser,
      isAdmin,
      onNewAdminReport: handleNewAdminReport,
      onNewUserReportReply: handleNewUserReportReply,
    }),
    [onBanListing, onBanSeller, showToast, patchAuthUser, isAdmin, handleNewAdminReport, handleNewUserReportReply]
  );

  const pushAlertsDeps = useMemo<PushAlertsDeps>(
    () => ({
      apiActive,
      catalogHydrated: hydrated,
      isAuthenticated,
      listingsRef,
      onAlertToast,
    }),
    [apiActive, hydrated, isAuthenticated, onAlertToast]
  );

  const wakeWordDeps = useMemo<WakeWordDeps>(
    () => ({
      hydrated,
      gdprConsent,
      userCity: user.city,
      listingsRef,
      setSearchQuery: handleSearchQuery,
      showToast,
      requestGdprModalForWake,
    }),
    [
      hydrated,
      gdprConsent,
      user.city,
      handleSearchQuery,
      showToast,
      requestGdprModalForWake,
    ]
  );

  return (
    <ModerationProvider deps={moderationDeps}>
      <PushAlertsProvider deps={pushAlertsDeps}>
        <WakeWordProvider deps={wakeWordDeps} actionsRef={wakeWordActionsRef}>
          <VautoBridgeProvider value={bridgeValue}>
            <ChatProvider>
              <SellerFlowContextProvider>
                <VautoFacade
                  catalog={catalogValue}
                  gdprModalOpen={gdprModalOpen}
                  acceptGdprConsent={acceptGdprConsent}
                  declineGdprConsent={declineGdprConsent}
                >
                  {children}
                </VautoFacade>
              </SellerFlowContextProvider>
            </ChatProvider>
          </VautoBridgeProvider>
        </WakeWordProvider>
      </PushAlertsProvider>
    </ModerationProvider>
  );
}

export function useVauto() {
  const ctx = useContext(VautoContext);
  if (!ctx) throw new Error("useVauto must be used within VautoProvider");
  return ctx;
}

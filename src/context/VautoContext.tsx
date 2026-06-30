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
import { Capacitor } from "@capacitor/core";
import { INITIAL_LISTINGS } from "@/data/mockListings";
import {
  markListingDemoFlags,
  mergeListingsForClient,
  shouldShowDemoCatalog,
} from "@/lib/demo-catalog";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { sanitizeAvatarForApi } from "@/lib/avatar-url";
import { generateDynamicFilters } from "@/lib/scoring";
import {
  type MarketplaceFilterState,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import { buildDisplayListings } from "@/lib/display-listings-pipeline";
import { defaultExpiresAt, isListingActive, withDefaultExpiry } from "@/lib/listing-expiry";
import { isListingPublicInFeed } from "@/lib/listing-visibility";
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
  saveChats,
  saveInvoices,
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
  apiUpdateUserAvatar,
  apiUpdateUserAvatarImage,
  apiUpdateUserProfile,
} from "@/lib/api/client";
import { composeUserName } from "@/lib/profile-display";
import { isDataApiEnabled, initDataApiConfig } from "@/lib/api/config";
import type {
  AiExtractedListing,
  ChatThread,
  EscrowTransaction,
  NegotiationTwinConfig,
  Listing,
  ListingCategory,
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
import { VautoAgentProvider } from "@/context/VautoAgentContext";
import {
  useVautoSearchDispatch,
  useVautoSearchState,
} from "@/context/VautoSearchContext";
import { LiveInterventionHost } from "@/components/agent/LiveInterventionHost";
import { SearchRefinementHost } from "@/components/agent/SearchRefinementHost";
import { AgentChromeHost } from "@/components/agent/AgentChromeHost";
import { ZeroUiMemoryProvider } from "@/context/ZeroUiMemoryContext";
import { FleetMatchBuddyHost } from "@/components/buddy/FleetMatchBuddyHost";
import { SellerFlowOverlays } from "@/components/SellerFlowOverlays";
import { AdminProjectContextProvider } from "@/context/AdminProjectContext";
import { ZeroUiSellerBridge } from "@/components/zero-ui/ZeroUiSellerBridge";
import { VautoBridgeProvider, type VautoBridgeValue } from "@/context/VautoBridge";
import { apiTopUpWallet, apiPromoteListing } from "@/lib/api/wallet-reviews";
import type { ListingEditPatch } from "@/lib/listing-edit";
import { logAnalytics } from "@/lib/analytics";
import { VautoCheckoutModal } from "@/components/checkout/VautoCheckoutModal";
import {
  getB2CPromoteProduct,
  type B2CPromoteProductId,
  type CheckoutSession,
} from "@/lib/monetization-catalog";
import {
  WARDROBE_STYLE_BOOST_ATTR,
  powerSubscriptionExpiryIso,
  styleBoostExpiryIso,
} from "@/lib/monetization-wardrobe";
import {
  jobCreditsForPlan,
  type B2BBillingPlanId,
} from "@/lib/b2b-plans";
import { createInvoiceFromCheckout } from "@/lib/invoices";
import { buildInvestorDemoBundle } from "@/lib/investor-demo";
import { saveJobApplications } from "@/lib/job-applications";
import { dispatchChatPushNotification } from "@/lib/chat-push";
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
import { WakeWordAgentBridge } from "@/components/voice/WakeWordAgentBridge";
import type { WakeWordGeminiAgent } from "@/lib/voice-intent-engine";
import { ChameleonThemeHost } from "@/components/theme/ChameleonThemeHost";
import {
  readWardrobeSpintaForced,
  writeWardrobeSpintaForced,
} from "@/lib/wardrobe-spinta-session";
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
  updateUser: (patch: Partial<UserProfile>) => Promise<boolean>;
  listings: Listing[];
  savedIds: Set<string>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchLoading: boolean;
  setSearchLoading: (loading: boolean) => void;
  /** Agent searchListings() result order — drives listing grid without chat text */
  agentPinnedListingIds: string[] | null;
  setAgentPinnedListings: (ids: string[] | null) => void;
  clearAgentPinnedListings: () => void;
  viewMode: import("@/lib/marketplace-view").MarketplaceViewMode;
  setViewMode: (mode: import("@/lib/marketplace-view").MarketplaceViewMode) => void;
  marketplaceFilters: import("@/lib/marketplace-view").MarketplaceFilterState;
  setMarketplaceFilters: (
    filters: import("@/lib/marketplace-view").MarketplaceFilterState
  ) => void;
  resetMarketplaceFilters: () => void;
  displayListings: import("@/lib/types").ScoredListing[];
  /** Nationwide matches when local geo filter is empty (Marktplaats smart fallback) */
  fallbackListings: import("@/lib/types").ScoredListing[];
  activeFilterIds: Set<string>;
  toggleFilter: (id: string) => void;
  rankedListings: import("@/lib/types").ScoredListing[];
  dynamicFilters: ReturnType<typeof generateDynamicFilters>;
  toggleSave: (id: string) => void;
  deleteListing: (id: string) => void;
  renewListing: (id: string) => Promise<void>;
  /** Reload listings feed from API after portal sync / import */
  refreshListingsCatalog: () => Promise<void>;

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
  publishBulkClothingListings: (drafts: AiExtractedListing[]) => Promise<void>;
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
  reprocessConfirmationPhoto: (imageDataUrl: string) => Promise<void>;
  applyAgentListingDraft: (draft: AiExtractedListing, imageUrl?: string) => void;
  applyAgentWardrobeBulk: (
    items: import("@/lib/wardrobe-vision").WardrobeDraftItem[],
    opts?: { imageUrl?: string; voiceAnnouncement?: string }
  ) => void;
  stageWardrobeBulkPreview: (
    items: import("@/lib/wardrobe-vision").WardrobeDraftItem[],
    voiceAnnouncement?: string
  ) => void;
  pendingWardrobeBulkItems: import("@/lib/wardrobe-vision").WardrobeDraftItem[] | null;
  pendingWardrobeVoice: string | null;
  importListingFromUrl: (url: string) => Promise<void>;
  /** Voice/text on home search that expresses sell/post intent → listing flow */
  startListingFromQuery: (text: string) => boolean;
  pendingSellerQuery: string | null;
  consumePendingSellerQuery: () => string | null;
  openManualListingWizard: (opts?: {
    previewImage?: string | null;
    toastMessage?: string;
    inputMode?: SellerInputMode;
  }) => void;
  photoCategoryMismatch: { fromCategory: ListingCategory; toCategory: ListingCategory } | null;
  revertPhotoCategoryMismatch: () => boolean;
  acceptPhotoCategoryMismatch: () => void;

  chats: ChatThread[];
  sendMessage: (chatId: string, text: string) => void;
  startChat: (listingId: string) => string | null;
  updateEscrow: (chatId: string, escrow: EscrowTransaction) => void;
  updateNegotiationTwin: (chatId: string, config: NegotiationTwinConfig) => void;

  isAuthenticated: boolean;
  authHydrated: boolean;
  authModalOpen: boolean;
  authRedirectPath: string | null;
  openAuthModal: (redirectPath?: string) => void;
  closeAuthModal: () => void;
  clearAuthRedirect: () => void;
  requireAuthForListing: (redirectPath?: string) => boolean;
  login: (data: LoginPayload) => Promise<void>;
  logout: () => void;
  topUpWallet: (amount: number) => void;
  subscribeB2BPlan: (planId: B2BBillingPlanId) => Promise<boolean>;
  openBillingPortal: () => Promise<boolean>;
  promoteListing: (listingId: string, cost: number, tierId: VisibilityTierId) => boolean;
  checkoutSession: CheckoutSession | null;
  openCheckout: (session: CheckoutSession) => void;
  closeCheckout: () => void;
  completeCheckout: (session: CheckoutSession, paymentMethod: string) => void;
  paymentHistoryVersion: number;
  activateInvestorDemo: () => Promise<void>;
  investorDemoActive: boolean;
  updateListing: (id: string, patch: ListingEditPatch) => void;
  markListingSold: (id: string) => void;
  startEditListingFlow: (listing: Listing) => void;

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
  setListingBanned: (listingId: string, banned: boolean) => void;
  setSellerBanned: (sellerId: string, banned: boolean) => void;
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
  showToast: (message: string, type?: "success" | "error" | "info" | "buddy") => void;
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
  openServiceLead: (leadId: string, chargedPrice?: number) => boolean;
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
  wardrobeSpintaForced: boolean;
  activateWardrobeSpinta: () => void;
}

type VautoCatalogSlice = Omit<
  VautoContextValue,
  | keyof SellerFlowContextValue
  | "chats"
  | "sendMessage"
  | "startChat"
  | "updateEscrow"
  | "updateNegotiationTwin"
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
  | "setListingBanned"
  | "setSellerBanned"
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
  | "displayListings"
  | "fallbackListings"
  | "popularListingIds"
  | "searchQuery"
  | "setSearchQuery"
  | "searchLoading"
  | "setSearchLoading"
  | "agentPinnedListingIds"
  | "setAgentPinnedListings"
  | "clearAgentPinnedListings"
  | "viewMode"
  | "setViewMode"
  | "marketplaceFilters"
  | "setMarketplaceFilters"
  | "resetMarketplaceFilters"
  | "searchVoiceMode"
  | "setSearchVoiceMode"
  | "searchInputMode"
  | "setSearchInputMode"
  | "dynamicFilters"
>;

const DEMO_SOLD_STORIES = [
  { id: "story-1", title: "BMW 320d", location: "Kaunas", timeAgo: "prieš 2 d." },
  { id: "story-2", title: "iPhone 15 Pro", location: "Vilnius", timeAgo: "prieš 3 d." },
  { id: "story-3", title: "VW Golf", location: "Klaipėda", timeAgo: "šiandien" },
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
  wakeWordAgentRef,
  hydrated,
  registerServiceLead,
  onSearchIntent,
}: {
  catalog: VautoCatalogSlice;
  children: ReactNode;
  gdprModalOpen: boolean;
  acceptGdprConsent: () => void;
  declineGdprConsent: () => void;
  wakeWordAgentRef: React.MutableRefObject<WakeWordGeminiAgent | null>;
  hydrated: boolean;
  registerServiceLead: (query: string) => void;
  onSearchIntent: (clean: string) => void;
}) {
  const searchState = useVautoSearchState();
  const searchDispatch = useVautoSearchDispatch();
  const chat = useChat();
  const seller = useSellerFlow();
  const wakeWord = useWakeWord();
  const moderation = useModeration();
  const pushAlerts = usePushAlerts();

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      const clean = sanitizeSearchQuery(q, "final");
      if (clean) searchDispatch.setSearchQuery(clean);
    }
  }, [hydrated, searchDispatch]);

  useEffect(() => {
    if (!searchState.searchQuery.trim()) {
      searchDispatch.clearAgentPinnedListings();
    }
  }, [searchState.searchQuery, searchDispatch]);

  const handleSearchQuery = useCallback(
    (q: string) => {
      const clean = sanitizeSearchQuery(q);
      searchDispatch.setSearchQuery(clean);
      searchDispatch.clearAgentPinnedListings();
      if (clean.length >= 2) onSearchIntent(clean);
      if (isServiceDemandQuery(clean)) registerServiceLead(clean);
    },
    [searchDispatch, onSearchIntent, registerServiceLead]
  );

  const dynamicFilters = useMemo(
    () => generateDynamicFilters(searchState.searchQuery),
    [searchState.searchQuery]
  );

  const visibleListings = useMemo(
    () =>
      catalog.listings.filter(
        (l) =>
          !l.banned &&
          !moderation.bannedUserIds.has(l.sellerId) &&
          (!l.isDemo || shouldShowDemoCatalog())
      ),
    [catalog.listings, moderation.bannedUserIds]
  );

  const displayResult = useMemo(
    () =>
      buildDisplayListings({
        visibleListings,
        searchQuery: searchState.searchQuery,
        agentPinnedListingIds: searchState.agentPinnedListingIds,
        marketplaceFilters: searchState.marketplaceFilters,
        activeFilterIds: catalog.activeFilterIds,
        dynamicFilters,
        visualSearchProfile: catalog.visualSearchProfile,
        visualRankScores: catalog.visualRankScores,
        buyerCoords: catalog.buyerCoords,
      }),
    [
      visibleListings,
      searchState.searchQuery,
      searchState.agentPinnedListingIds,
      searchState.marketplaceFilters,
      catalog.activeFilterIds,
      dynamicFilters,
      catalog.visualSearchProfile,
      catalog.visualRankScores,
      catalog.buyerCoords,
    ]
  );

  const displayListings = displayResult.listings;
  const fallbackListings = displayResult.fallbackListings;
  const rankedListings = displayListings;

  const popularListingIds = useMemo(
    () => getPopularListingIds(visibleListings, 4),
    [visibleListings]
  );

  const value = useMemo<VautoContextValue>(
    () => ({
      ...catalog,
      ...searchState,
      ...searchDispatch,
      setSearchQuery: handleSearchQuery,
      dynamicFilters,
      ...chat,
      ...seller,
      ...wakeWord,
      ...moderation,
      ...pushAlerts,
      rankedListings,
      displayListings,
      fallbackListings,
      popularListingIds,
    }),
    [
      catalog,
      searchState,
      searchDispatch,
      handleSearchQuery,
      dynamicFilters,
      chat,
      seller,
      wakeWord,
      moderation,
      pushAlerts,
      rankedListings,
      displayListings,
      fallbackListings,
      popularListingIds,
    ]
  );

  return (
    <VautoContext.Provider value={value}>
      <AdminProjectContextProvider>
        <ZeroUiMemoryProvider>
          <VautoAgentProvider>
            <WakeWordAgentBridge agentRef={wakeWordAgentRef} />
            <FleetMatchBuddyHost />
            <LiveInterventionHost />
            <SearchRefinementHost />
            <SellerFlowOverlays />
            <AgentChromeHost />
            {children}
          </VautoAgentProvider>
        </ZeroUiMemoryProvider>
      </AdminProjectContextProvider>
      <ZeroUiSellerBridge />
      <ChameleonThemeHost />
      <ReviewPromptHost />
      <WakeWordHost />
      <GdprConsentModal
        open={gdprModalOpen}
        onAccept={acceptGdprConsent}
        onDecline={declineGdprConsent}
      />
      <ConfirmDialog />
      <CheckoutHost />
    </VautoContext.Provider>
  );
}

function CheckoutHost() {
  const { checkoutSession, closeCheckout, completeCheckout } = useVauto();
  return (
    <VautoCheckoutModal
      session={checkoutSession}
      onClose={closeCheckout}
      onComplete={completeCheckout}
    />
  );
}

export function VautoProvider({ children }: { children: ReactNode }) {
  const {
    user,
    isAuthenticated,
    authHydrated,
    isAdmin,
    updateUser: patchAuthUser,
    refreshAuthUser,
    openAuthModal,
    closeAuthModal,
    clearAuthRedirect,
    requireAuthForListing,
    login,
    logout,
    restoreDemoSession,
    authModalOpen,
    authRedirectPath,
    consumePendingAuthIntent,
  } = useAuth();
  const { reviews, submitReview } = useReviews();
  const { setSearchInputMode } = useVautoSearchDispatch();

  const [hydrated, setHydrated] = useState(false);
  const [apiActive, setApiActive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>(
    shouldShowDemoCatalog() ? markListingDemoFlags(INITIAL_LISTINGS) : []
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
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
  const [visualSearchProfile, setVisualSearchProfile] =
    useState<VisualSearchProfile | null>(null);
  const [visualRankScores, setVisualRankScores] = useState<Record<string, number>>({});
  const [visualSearchRefining, setVisualSearchRefining] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [chameleonTheme, setChameleonTheme] = useState<ChameleonThemeId>("flux");
  const [wardrobeSpintaForced, setWardrobeSpintaForced] = useState(false);
  const [detectedAdaptiveKey, setDetectedAdaptiveKey] =
    useState<AdaptiveCategoryKey | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null);
  const [paymentHistoryVersion, setPaymentHistoryVersion] = useState(0);
  const [investorDemoActive, setInvestorDemoActive] = useState(false);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engagementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buddyFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewedListingsRef = useRef<Set<string>>(new Set());
  const gdprPendingAction = useRef<(() => void) | null>(null);
  const gdprWakeWordPending = useRef(false);
  const wakeWordActionsRef = useRef<WakeWordActions | null>(null);
  const wakeWordAgentRef = useRef<WakeWordGeminiAgent | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const userRef = useRef(user);
  userRef.current = user;
  const profileLocalEditRef = useRef(false);

  useEffect(() => {
    setWardrobeSpintaForced(readWardrobeSpintaForced());
  }, []);

  const activateWardrobeSpinta = useCallback(() => {
    writeWardrobeSpintaForced(true);
    setWardrobeSpintaForced(true);
    setChameleonTheme("wardrobe");
    setDetectedAdaptiveKey("clothing");
  }, []);

  useEffect(() => {
    async function load() {
      try {
        await initDataApiConfig();
        if (isDataApiEnabled() && (await apiHealthCheck())) {
          setApiActive(true);
          const storedUser = loadUser();
          const auth = loadAuthSession();
          const hasAuthUser = Boolean(storedUser?.id && auth?.isAuthenticated);
          const listingsRes = await apiFetchListings();
          const [savedRes, userRes] = hasAuthUser
            ? await Promise.all([
                apiFetchSaved(storedUser!.id),
                apiFetchUser(storedUser!.id),
              ])
            : [null, null];

          const errors: string[] = [];
          if (listingsRes.ok && Array.isArray(listingsRes.data)) {
            const fromApi = listingsRes.data.map(withDefaultExpiry);
            setListings(
              normalizeListings(
                mergeListingsForClient(fromApi, INITIAL_LISTINGS)
              )
            );
          } else {
            if (!listingsRes.ok) errors.push(listingsRes.error);
            setListings(
              shouldShowDemoCatalog()
                ? normalizeListings(markListingDemoFlags(INITIAL_LISTINGS))
                : []
            );
          }
          if (savedRes?.ok) setSavedIds(new Set(savedRes.data));
          else if (savedRes) errors.push(savedRes.error);
          if (userRes?.ok && auth?.isAuthenticated) {
            if (!profileLocalEditRef.current) {
              patchAuthUser(userRes.data);
            }
          } else if (storedUser && auth?.isAuthenticated) {
            patchAuthUser({ ...storedUser, role: storedUser.role ?? "private" });
          }

          if (errors.length) setSyncError(errors[0]);
          const storedIntent = loadSearchIntent();
          if (storedIntent) setSearchIntentEvents(storedIntent);
          const storedDismissed = loadSoldPromptDismissed();
          if (storedDismissed) setSoldPromptDismissed(new Set(storedDismissed));
          setGdprConsent(loadGdprConsent());
          return;
        }

        setApiActive(false);
        const storedUser = loadUser();
        const auth = loadAuthSession();
        const storedListings = loadListings();
        const storedSaved = loadSavedIds();
        if (auth?.isAuthenticated && storedUser) {
          patchAuthUser({ ...storedUser, role: storedUser.role ?? "private" });
        }
        const offlineBase = storedListings?.length
          ? normalizeListings(storedListings)
          : [];
        setListings(
          normalizeListings(
            mergeListingsForClient(offlineBase, INITIAL_LISTINGS)
          )
        );
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
      } catch (e) {
        console.error("[vauto] listing catalog load failed", e);
        setListings(
          shouldShowDemoCatalog()
            ? normalizeListings(markListingDemoFlags(INITIAL_LISTINGS))
            : []
        );
        setSyncError("Nepavyko įkelti skelbimų.");
      } finally {
        setHydrated(true);
      }
    }
    void load();
  }, [patchAuthUser]);

  const syncServiceLeadsFromApi = useCallback(async () => {
    const res = await apiFetchServiceLeads();
    if (!res.ok) return;
    setLiveServiceLeads(res.data);
    setOpenedServiceLeadIds(
      new Set(res.data.filter((lead) => lead.opened).map((lead) => lead.id))
    );
  }, []);

  useEffect(() => {
    if (!hydrated || !apiActive || !isAuthenticated || user.id === "guest") return;
    void syncServiceLeadsFromApi();
  }, [hydrated, apiActive, isAuthenticated, user.id, syncServiceLeadsFromApi]);

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
    const loadCoords = () => {
      getUserCoords().then((coords) => {
        if (!coords) return;
        setBuyerCoords(coords);
        setListings((prev) => applyBuyerDistances(prev, coords));
      });
    };

    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      const timer = window.setTimeout(loadCoords, 4_000);
      return () => window.clearTimeout(timer);
    }

    loadCoords();
  }, []);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const updateUser = useCallback(
    async (patch: Partial<UserProfile>): Promise<boolean> => {
      const safePatch = { ...patch };
      if (
        typeof safePatch.avatar === "string" &&
        !safePatch.avatar.startsWith("data:")
      ) {
        safePatch.avatar = sanitizeAvatarForApi(safePatch.avatar);
      }

      const profileFieldKeys = ["firstName", "lastName", "nickname"] as const;
      const hasProfileFields = profileFieldKeys.some((k) => k in safePatch);
      if (hasProfileFields) {
        const mergedNames = { ...userRef.current, ...safePatch };
        safePatch.name = composeUserName({
          firstName: mergedNames.firstName,
          lastName: mergedNames.lastName,
          nickname: mergedNames.nickname,
          fallback: userRef.current.name,
        });
      }

      profileLocalEditRef.current = true;
      patchAuthUser(safePatch);

      if (!isDataApiEnabled()) {
        profileLocalEditRef.current = false;
        return true;
      }

      const merged = { ...userRef.current, ...safePatch };
      const avatarOnly =
        Object.keys(safePatch).length === 1 &&
        typeof safePatch.avatar === "string";
      const profileOnly =
        hasProfileFields &&
        Object.keys(safePatch).every(
          (k) =>
            profileFieldKeys.includes(k as (typeof profileFieldKeys)[number]) ||
            k === "name"
        );

      if (profileOnly) {
        const res = await apiUpdateUserProfile({
          firstName: safePatch.firstName,
          lastName: safePatch.lastName,
          nickname: safePatch.nickname,
        });
        if (!res.ok) {
          profileLocalEditRef.current = false;
          setSyncError(`Profilis neišsaugotas: ${res.error}`);
          return false;
        }
        patchAuthUser(res.data);
        profileLocalEditRef.current = false;
        return true;
      }

      if (avatarOnly) {
        const rawAvatar = patch.avatar!;
        const res = rawAvatar.startsWith("data:")
          ? await apiUpdateUserAvatarImage(rawAvatar)
          : await apiUpdateUserAvatar(merged.id, safePatch.avatar!);

        if (!res.ok) {
          profileLocalEditRef.current = false;
          setSyncError(`Profilio nuotrauka neišsaugota: ${res.error}`);
          return false;
        }

        patchAuthUser({ avatar: res.data.avatar });
        profileLocalEditRef.current = false;
        return true;
      }

      const res = await apiUpdateUser(merged);

      if (!res.ok) {
        profileLocalEditRef.current = false;
        setSyncError(`Profilis neišsaugotas: ${res.error}`);
        return false;
      }

      const fresh = await apiFetchUser(merged.id);
      if (fresh.ok) {
        patchAuthUser(fresh.data);
      }

      await refreshAuthUser();
      profileLocalEditRef.current = false;
      return true;
    },
    [patchAuthUser, refreshAuthUser]
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
    return sold.length > 0 || process.env.NODE_ENV !== "production"
      ? sold.length > 0
        ? sold
        : DEMO_SOLD_STORIES
      : [];
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
    () => mergeServiceLeads(liveServiceLeads, { includeDemo: !apiActive }),
    [liveServiceLeads, apiActive]
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
    (leadId: string, chargedPrice?: number): boolean => {
      const lead = serviceLeads.find((l) => l.id === leadId);
      if (!lead) return false;
      if (openedServiceLeadIds.has(leadId)) return true;

      const price =
        chargedPrice ??
        leadPriceForCoverage(lead.leadPrice, {
          radiusKm: user.serviceRadiusKm,
          nationwide: user.serviceNationwide,
          topRatedPlus: false,
        });
      const balance = user.walletBalance ?? 0;
      if (balance < price) return false;

      if (apiActive && isDataApiEnabled()) {
        patchAuthUser({ walletBalance: balance - price });
        setOpenedServiceLeadIds((prev) => new Set([...prev, leadId]));
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
                  ? {
                      ...item,
                      contactPhone: res.data.lead.contactPhone,
                      opened: true,
                    }
                  : item
              )
            );
          }
        });
        return true;
      }

      patchAuthUser({ walletBalance: balance - price });
      setOpenedServiceLeadIds((prev) => new Set([...prev, leadId]));
      setLiveServiceLeads((prev) =>
        prev.map((item) =>
          item.id === leadId
            ? { ...item, contactPhone: item.contactPhone ?? lead.contactPhone, opened: true }
            : item
        )
      );

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

  const clearVisualSearch = useCallback(
    (opts?: { keepInputMode?: boolean }) => {
      setVisualSearchProfile(null);
      setVisualRankScores({});
      setVisualSearchRefining(false);
      if (!opts?.keepInputMode) setSearchInputMode(null);
    },
    [setSearchInputMode]
  );

  const applyVisualSearch = useCallback(
    async (profile: VisualSearchProfile) => {
      setVisualSearchProfile(profile);
      setVisualRankScores({});
      setVisualSearchRefining(true);
      try {
        const candidates = listings
          .filter((l) => isListingPublicInFeed(l))
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
              .filter((l) => !l.banned && isListingActive(l) && l.images?.length)
              .slice(0, 40)
              .map((l) => ({
                id: l.id,
                image: l.images[0]!,
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
        if (isDataApiEnabled()) {
          void apiUpdateSaved(user.id, Array.from(next)).then((r) => {
            if (!r.ok) setSyncError(`Išsaugota nepavyko: ${r.error}`);
          });
        }
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

  const refreshListingsCatalog = useCallback(async () => {
    if (!isDataApiEnabled()) return;
    const listingsRes = await apiFetchListings({ limit: 200 });
    if (!listingsRes.ok || !Array.isArray(listingsRes.data)) {
      if (!listingsRes.ok) setSyncError(listingsRes.error);
      return;
    }
    const fromApi = listingsRes.data.map(withDefaultExpiry);
    const merged = normalizeListings(
      mergeListingsForClient(fromApi, INITIAL_LISTINGS)
    );
    setListings(merged);
    saveListings(merged);
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" | "buddy" = "success") => {
      setToast({ message, type });
    },
    []
  );

  const prevAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    if (!authHydrated) return;
    const justLoggedIn = isAuthenticated && !prevAuthenticatedRef.current;
    prevAuthenticatedRef.current = isAuthenticated;
    if (!justLoggedIn) return;
    const intent = consumePendingAuthIntent();
    if (intent === "wardrobe") {
      activateWardrobeSpinta();
      showToast("Asortimentas aktyvuotas — sveiki atvykę į skelbimų kabinetą!", "success");
    } else if (intent === "pro") {
      showToast("Prisijungta! Pro verslą galite aktyvuoti profilio skydelyje.", "info");
    }
  }, [
    isAuthenticated,
    authHydrated,
    consumePendingAuthIntent,
    activateWardrobeSpinta,
    showToast,
  ]);

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
            showToast(
              r.data.mode === "demo"
                ? `Demo papildymas: +${amount} € (be kortelės)`
                : `Balansas papildytas +${amount} €`,
              "success"
            );
          } else {
            setSyncError(`Piniginė neišsaugota: ${r.error}`);
          }
        });
        return;
      }
      patchAuthUser({ walletBalance: (user.walletBalance ?? 0) + amount });
      showToast(`Demo papildymas: +${amount} €`, "success");
    },
    [patchAuthUser, user.walletBalance, apiActive, showToast]
  );

  const subscribeB2BPlan = useCallback(
    async (planId: B2BBillingPlanId) => {
      const legacyId = planId === "start" ? "starter" : planId === "growth" ? "pro" : "pro";
      if (apiActive) {
        const r = await apiSubscribeB2BPlan(legacyId);
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
              role: u.role === "pro" || planId !== "start" ? "pro" : user.role,
              jobListingCredits: jobCreditsForPlan(planId),
              billingModel: "subscription",
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
        role: "pro",
        billingModel: "subscription",
        jobListingCredits: jobCreditsForPlan(planId),
      });
      showToast(`${planId.toUpperCase()} planas aktyvuotas (demo)`, "success");
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

  const applyB2CPromote = useCallback(
    (listingId: string, productId: B2CPromoteProductId) => {
      const product = getB2CPromoteProduct(productId);
      const now = new Date();
      const expiresAt = product.durationDays
        ? new Date(now.getTime() + product.durationDays * 86_400_000).toISOString()
        : undefined;

      setListings((prev) =>
        prev.map((l) => {
          if (l.id !== listingId) return l;
          const m = mockListingMetrics(l);
          const next: Listing = {
            ...l,
            promoted: true,
            createdAt: now.toISOString(),
            views: m.views + (product.bumpOnly ? 25 : 50),
            callClicks: m.callClicks + 3,
            interestScore: Math.min(99, m.interestScore + 5),
          };
          if (product.visibilityTier) {
            next.visibilityTier = product.visibilityTier;
            next.visibilityExpiresAt = expiresAt;
            if (product.visibilityTier === "top") {
              next.visibilityPlanTier = 5;
            } else if (product.visibilityTier === "plus") {
              next.visibilityPlanTier = 2;
            }
          }
          return next;
        })
      );

      if (isDataApiEnabled()) {
        const tierId: VisibilityTierId =
          product.visibilityTier === "top" ? 5 : product.visibilityTier === "plus" ? 2 : 1;
        void apiPromoteListing(listingId, product.priceEur, tierId).catch(() => undefined);
      }
    },
    []
  );

  const openCheckout = useCallback((session: CheckoutSession) => {
    setCheckoutSession(session);
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckoutSession(null);
  }, []);

  const completeCheckout = useCallback(
    (session: CheckoutSession, paymentMethod: string) => {
      createInvoiceFromCheckout({
        user,
        serviceTitle: session.lineTitle,
        serviceDescription: session.lineDescription,
        amountGross: session.amountEur,
        vatRate: session.vatRate,
        paymentMethod,
        checkoutKind: session.kind,
        productId: session.productId,
        listingId: session.listingId,
      });
      setPaymentHistoryVersion((v) => v + 1);

      if (session.kind === "b2c_promote" && session.listingId) {
        applyB2CPromote(session.listingId, session.productId as B2CPromoteProductId);
        const product = getB2CPromoteProduct(session.productId as B2CPromoteProductId);
        showToast(`„${product.title}“ aktyvuota! Skelbimas atnaujintas.`, "success");
        logAnalytics("checkout_b2c_promote", {
          listingId: session.listingId,
          productId: session.productId,
          amount: session.amountEur,
        });
      } else if (session.kind === "b2b_subscription") {
        const planId = session.productId as B2BBillingPlanId;
        patchAuthUser({
          billingPlan: planId,
          role: "pro",
          billingModel: "subscription",
          jobListingCredits: jobCreditsForPlan(planId),
        });
        showToast(
          `${planId.toUpperCase()} prenumerata aktyvuota — kreditai priskirti!`,
          "success"
        );
        logAnalytics("checkout_b2b_plan", { planId, amount: session.amountEur });
      } else if (session.kind === "wardrobe_style_boost" && session.listingId) {
        const target = listingsRef.current.find((l) => l.id === session.listingId);
        if (target) {
          updateListing(session.listingId, {
            attributes: {
              ...(target.attributes ?? {}),
              [WARDROBE_STYLE_BOOST_ATTR]: styleBoostExpiryIso(),
            },
          });
        }
        showToast(
          "Prekė įtraukta į AI asmeninių stiliaus derinių srautą!",
          "success"
        );
        logAnalytics("checkout_wardrobe_style_boost", {
          listingId: session.listingId,
          amount: session.amountEur,
        });
      } else if (session.kind === "wardrobe_power_subscription") {
        patchAuthUser({
          wardrobePowerUser: true,
          wardrobePowerUntil: powerSubscriptionExpiryIso(),
        });
        showToast("Asortimento Power-User aktyvuota — neribotas importas!", "success");
        logAnalytics("checkout_wardrobe_power", { amount: session.amountEur });
      }

      setCheckoutSession(null);
    },
    [user, applyB2CPromote, patchAuthUser, showToast, updateListing]
  );

  const activateInvestorDemo = useCallback(async () => {
    const bundle = buildInvestorDemoBundle(listings);
    restoreDemoSession(bundle.profile);
    const mergedListings = [
      ...bundle.jobListings,
      ...listings.filter(
        (l) => !bundle.jobListings.some((j) => j.id === l.id)
      ),
    ];
    setListings(mergedListings);
    saveListings(mergedListings);
    saveChats(bundle.chats);
    saveInvoices(bundle.invoices);
    saveJobApplications(bundle.applications);
    setPaymentHistoryVersion((v) => v + 1);
    setInvestorDemoActive(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("vauto_investor_demo_unlocked_v1", "1");
      window.dispatchEvent(new Event("vauto-chats-reload"));
    }
    showToast("Investuotojų demo aktyvuota — B2B kabinetas paruoštas!", "success");
    logAnalytics("seller_engagement_push", { demo: "investor" });

    bundle.pushPayloads.forEach((payload, i) => {
      window.setTimeout(() => {
        void dispatchChatPushNotification(payload);
      }, 1200 + i * 1800);
    });
  }, [listings, restoreDemoSession, showToast]);

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

      const applyLocalPromote = (walletBalance: number, listingPatch?: Listing) => {
        patchAuthUser({ walletBalance });
        setListings((prev) =>
          prev.map((l) => {
            if (l.id !== listingId) return l;
            if (listingPatch) {
              return { ...l, ...listingPatch, promoted: true };
            }
            const m = mockListingMetrics(l);
            return {
              ...l,
              promoted: true,
              visibilityPlanTier: tierId,
              visibilityTier: tierId >= 2 ? "top" : "plus",
              visibilityExpiresAt: expiresAt,
              attributes: attrs,
              views: m.views + 50 * tierId,
              callClicks: m.callClicks + 5 * tierId,
              interestScore: Math.min(99, m.interestScore + 4 * tierId),
            };
          })
        );
      };

      if (apiActive) {
        void apiPromoteListing(listingId, cost, tierId).then((r) => {
          if (r.ok) {
            applyLocalPromote(r.data.walletBalance, r.data.listing);
          } else {
            setSyncError(`Promote nepavyko: ${r.error}`);
          }
        });
        return true;
      }

      applyLocalPromote(balance - cost);
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

  const onSetListingBanned = useCallback((listingId: string, banned: boolean) => {
    setListings((prev) =>
      prev.map((l) => (l.id === listingId ? { ...l, banned } : l))
    );
    if (banned) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  }, []);

  const onBanSeller = useCallback((sellerId: string) => {
    setListings((prev) =>
      prev.map((l) => (l.sellerId === sellerId ? { ...l, banned: true } : l))
    );
  }, []);

  const onAlertToast = useCallback((message: string) => {
    setToast({ message, type: "info" });
  }, []);

  const onSearchIntent = useCallback((clean: string) => {
    setSearchIntentEvents((prev) => recordSearchIntent(prev, clean));
  }, []);

  const catalogValue = useMemo(
    (): VautoCatalogSlice => ({
      user,
      updateUser,
      listings,
      savedIds,
      activeFilterIds,
      toggleFilter,
      toggleSave,
      deleteListing,
      renewListing,
      refreshListingsCatalog,
      syncError,
      clearSyncError,
      apiActive,
      visualSearchProfile,
      visualRankScores,
      visualSearchRefining,
      clearVisualSearch,
      applyVisualSearch,
      isAuthenticated,
      authHydrated,
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
      checkoutSession,
      openCheckout,
      closeCheckout,
      completeCheckout,
      paymentHistoryVersion,
      activateInvestorDemo,
      investorDemoActive,
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
      wardrobeSpintaForced,
      activateWardrobeSpinta,
    }),
    [
      user,
      updateUser,
      listings,
      savedIds,
      activeFilterIds,
      toggleFilter,
      toggleSave,
      deleteListing,
      renewListing,
      refreshListingsCatalog,
      syncError,
      clearSyncError,
      apiActive,
      visualSearchProfile,
      visualRankScores,
      visualSearchRefining,
      clearVisualSearch,
      applyVisualSearch,
      isAuthenticated,
      authHydrated,
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
      checkoutSession,
      openCheckout,
      closeCheckout,
      completeCheckout,
      paymentHistoryVersion,
      activateInvestorDemo,
      investorDemoActive,
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
      wardrobeSpintaForced,
      activateWardrobeSpinta,
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
      activateWardrobeSpinta,
      refreshListingsCatalog,
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
      activateWardrobeSpinta,
      refreshListingsCatalog,
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
      onSetListingBanned,
      setSyncError,
      showToast,
      patchAuthUser,
      isAdmin,
      onNewAdminReport: handleNewAdminReport,
      onNewUserReportReply: handleNewUserReportReply,
    }),
    [onBanListing, onBanSeller, onSetListingBanned, showToast, patchAuthUser, isAdmin, handleNewAdminReport, handleNewUserReportReply]
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
      agentRef: wakeWordAgentRef,
      showToast,
      requestGdprModalForWake,
    }),
    [hydrated, gdprConsent, showToast, requestGdprModalForWake]
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
                  hydrated={hydrated}
                  registerServiceLead={registerServiceLead}
                  onSearchIntent={onSearchIntent}
                  gdprModalOpen={gdprModalOpen}
                  acceptGdprConsent={acceptGdprConsent}
                  declineGdprConsent={declineGdprConsent}
                  wakeWordAgentRef={wakeWordAgentRef}
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

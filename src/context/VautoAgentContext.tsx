"use client";

import { usePathname, useRouter } from "next/navigation";
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
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useChat } from "@/context/ChatContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import {
  apiVautoAgentStream,
  capImageUrlsForAgentWire,
} from "@/lib/api/vauto-agent-stream";
import {
  compressForAgentVisionWire,
  selectAgentVisionUrls,
} from "@/lib/prepare-chat-images-for-agent";
import {
  BUDDY_REPEAT_PROMPT,
  buddyMessageForAgentFailure,
} from "@/lib/voice-graceful";
import { requestWizardAgentExpand } from "@/lib/ai-conversational-recovery";
import {
  buildCurrentPageContext,
  buildWelcomeBackAgentGreeting,
  compactListingsForAgent,
  compactMyListingsForAgent,
  extractLastSessionTopic,
  isAgentSessionExpired,
  isTooShortAgentQuery,
  mapAgentDraftToListing,
  readAgentSessionLastActiveAt,
  registerAgentErrorReporter,
  registerAgentGreetingHost,
  registerAgentPendingImagesHost,
  registerAgentFlowHost,
  notifyWardrobeBulkImportOpened,
  notifyAgentFlow,
  resolveAccountTypeLabel,
  resolveAgentNoiseReply,
  resolveAgentUserRole,
  summarizeMyListingsSummary,
  touchAgentSessionActivity,
  type AgentChatMessage,
} from "@/lib/vauto-agent-client";
import { registerWanted } from "@/lib/matching-service";
import {
  buildSupervisorApplicationState,
  buildSupervisorCurrentUser,
  resolveClientPageUrl,
} from "@/lib/supervisor-agent-state";
import { conductorSetAgentBusy, registerConductorSearchExecutor } from "@/lib/vauto-conductor";
import { useAdminProjectContextForAgent } from "@/context/AdminProjectContext";
import { useNavigation, viewTitle } from "@/context/NavigationContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { useZeroUiMemory } from "@/context/ZeroUiMemoryContext";
import {
  microPaymentFromToolResult,
  resolveClientMonetizationState,
  resolveSmartBoostPrice,
} from "@/lib/monetization-engine";
import { persistPendingZeroUiScreen } from "@/lib/zero-ui-pending";
import {
  AGENT_QUEUE_FULL_MESSAGE,
  createAgentBusyGate,
} from "@/lib/agent-busy-gate";
import type { ZeroUiScreen } from "@/lib/zero-ui-screens";
import {
  filtersFromSearchAction,
  parseSearchFiltersFromUserText,
  selectAgentSessionMessages,
  shouldResetSearchSession,
} from "@/lib/agent-session-memory";
import { mergeVoiceUiFilters } from "@/lib/voice-ui-actions";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { toLithuanianVocative } from "@/lib/lithuanian-name-case";
import { resolveAgentDisplayQuery } from "@/lib/agent-display-query";
import { resolveAgentChatReply } from "@/lib/agent-chat-reply";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";
import { resolveBrowseAllIntent, createBrowseAllAction, isListingConfirmationPhrase } from "@/lib/browse-all-intent";
import { applyBrowseAllMarketplaceState } from "@/lib/browse-all-marketplace-state";
import { dispatchHomeReset, subscribeHomeReset } from "@/lib/home-reset";
import { clearPhotoSearchSession } from "@/lib/photo-search-session";
import { tryHandleAgentQuickReply, type AgentBargainingOffer } from "@/lib/agent-quick-reply-router";
import {
  isPhotoIntentListingChip,
  isPhotoIntentSearchChip,
} from "@/lib/photo-intent-resolution";
import {
  ensurePendingPhotoIntent,
  isPhotoIntentRoutingReply,
} from "@/lib/photo-intent-bootstrap";
import { tryHandleVisualDamageReply } from "@/lib/visual-damage-replies";
import { sanitizeAgentAction } from "@/lib/agent-action-guard";
import {
  WARDROBE_BULK_IMPORT_CHIPS,
  WARDROBE_BULK_IMPORT_GREETING,
} from "@/lib/agent-wardrobe-bulk-dialogue";
import type { AgentGreetingOptions } from "@/lib/vauto-agent-client";
import {
  mapAgentWardrobeItems,
} from "@/lib/agent-wardrobe-bridge";
import { completeVoiceTeardown, isUiDrivingAgentAction } from "@/lib/voice-teardown";
import { chatThreadPath } from "@/lib/chat-routes";
import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
  mergeAgentIntoMarketplaceFilters,
  snapRadiusKm,
} from "@/lib/marketplace-view";
import {
  apiCreateUserRequirement,
  type ProactiveOfferContext,
} from "@/lib/offer-engine-client";
import {
  isOnAddListingPath,
  pushAddListing,
} from "@/lib/listing-navigation";
import {
  buildListingEditOpener,
  isListingEditHostPath,
  LISTING_EDIT_SESSION_EVENT,
  readListingEditSession,
  type ListingEditSession,
} from "@/lib/listing-edit-session";
import { nearestLtCityFromCoords } from "@/lib/listing-location-context";
import {
  buildManualFillChatRedirectReply,
  isListingConversationInput,
  isManualFillIntent,
  tryApplyListingChatInput,
  parsePriceFromChatInput,
} from "@/lib/agent-listing-chat-input";
import {
  buildProfileListingContact,
  hasProfileListingContact,
  injectProfileContactsForPublish,
  isContactOnlyUserMessage,
  syncProfileContactsFromChat,
  validatePublishSession,
} from "@/lib/profile-listing-sync";
import {
  buildPrePublishCardPayload,
  evaluatePrePublishReadiness,
} from "@/lib/pre-publish-validation";
import {
  AWAITING_PHOTOS_NUDGE,
  buildConversationalMissingPrompt,
  buildDraftingCompletePhotosPrompt,
  buildPostVisionHeroMessage,
  dispatchListingFlowTurn,
  inferListingFlowState,
  isVisionObjectSellChip,
  nounFromVisionObjectSellChip,
  POST_VISION_PUBLISH_CHIPS,
  POST_VISION_PUBLISH_GATE,
  PRE_PUBLISH_CARD_INTRO,
  resolveLockedListingFlowState,
  shouldBypassPhotosNudge,
  transitionListingFlow,
} from "@/lib/listing-conversational-flow";
import {
  formatListingDescriptionChatMessage,
  isDescriptionGateOnlyReply,
} from "@/lib/listing-description-chat";
import { resolvePublishListingDescription } from "@/lib/listing-text-sanitize";
import {
  parseDetectedObjectsFromAttributes,
} from "@/lib/vision-choice-chips";
import {
  buildListingEditPrompt,
  buildListingEditQuickReplies,
  editFieldFromChip,
  gapFieldFromChip,
  isEditActionChip,
  isGapActionChip,
  LISTING_EDIT_INTRO,
  setAwaitingListingEditField,
} from "@/lib/listing-wizard-flow";
import {
  executeDirectPhotoIntentChip,
  isDirectAgentActionChip,
  pickListingPhotoDirect,
} from "@/lib/direct-agent-actions";
import {
  buildListingContactUpdateReply,
  parseListingContactFromText,
} from "@/lib/listing-contact-parse";
import { logHeroContactReask } from "@/lib/hero-kpis";
const AI_TWIN_NUDGE_KEY = "vauto_ai_twin_nudge_v1";

export interface AgentSendOptions {
  skipBusyCheck?: boolean;
  /** When true, user bubble was already shown (queued retry). */
  skipUserBubble?: boolean;
  /** Tiny vision subset for the agent stream (1 compressed image). */
  pendingImageUrls?: string[];
  /** Full session gallery for draft/publish (up to 6) — not all sent on the wire. */
  sessionImageUrls?: string[];
  /** User input came from microphone in agent sheet or search bar */
  fromVoice?: boolean;
  /** Submitted from main SearchBar — Gemini must route via function calling */
  fromSearchBar?: boolean;
  /** Proactive Offer Engine — no-match lead or bargaining signal */
  proactiveOffer?: ProactiveOfferContext;
  /** System-triggered proactive call — do not echo trigger text as user bubble */
  proactiveTriggerOnly?: boolean;
}

interface VautoAgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openWithGreeting: (text: string, options?: AgentGreetingOptions) => void;
  messages: AgentChatMessage[];
  busy: boolean;
  /** Alias for busy — ChatGPT-style „thinking" state */
  isAgentThinking: boolean;
  /** Live SSE progress label while agent works */
  streamThinkingLabel: string;
  sendAgentMessage: (
    text: string,
    options?: AgentSendOptions
  ) => Promise<WakeWordAgentResult>;
  applyAgentActions: (
    actions: import("@/lib/vauto-agent-client").VautoAgentAction
  ) => void;
  reportAgentError: (code: string, message?: string) => void;
  /** Wipe chat, aiDraft, and marketplace overlays — fresh home state. */
  resetHomeAgentSession: () => void;
  /** Run modal/chip actions directly — never inject raw chip text as user messages. */
  handleDirectAgentChip: (chip: string) => Promise<boolean>;
  /** Hide pre-publish card and show field edit chips. */
  enterListingEditMode: () => void;
  /** When true, live pre-publish card is hidden (edit mode). */
  hidePrePublishCard: boolean;
  /** User confirmed draft via „viskas tinka" — show publish card. */
  listingPublishConfirmed: boolean;
  /** Photos attached this session (blob/data URLs) pending publish. */
  sessionPendingImageUrls: string[];
  /** Reset publish card state after successful listing publish. */
  resetPublishSession: () => void;
}

const VautoAgentContext = createContext<VautoAgentContextValue | null>(null);

export function VautoAgentProvider({ children }: { children: ReactNode }) {
  const { trackEvent, getBehaviorSnapshot } = useUserBehavior();
  const {
    setSearchQuery,
    setSearchInputMode,
    setSearchVoiceMode,
    setSearchLoading,
    searchQuery,
    setAgentPinnedListings,
    setViewMode,
    setMarketplaceFilters,
    resetMarketplaceFilters,
    marketplaceFilters,
  } = useVautoSearch();
  const {
    listings,
    user,
    setListingBanned,
    markListingSold,
    showToast,
    isAuthenticated,
    openAuthModal,
    subscribeWishlist,
    rankedListings,
    clearVisualSearch,
    toggleSave,
    activateWardrobeSpinta,
    sellerAnalytics,
    buyerIntentCount,
    buyerCoords,
    applyVisualSearch,
    updateUser,
  } = useVauto();
  const {
    aiDraft,
    sellerStep,
    applyAgentListingDraft,
    applyAgentWardrobeBulk,
    pendingWardrobeBulkItems,
    pendingWardrobeVoice,
    publishBulkClothingListings,
    publishListing,
    isPublishingListing,
    revertPhotoCategoryMismatch,
    acceptPhotoCategoryMismatch,
    submitSellerContent,
    updateAiDraft,
    updateSellerMedia,
    sellerVisionRecoveryActive,
    cancelSellerFlow,
    sellerPreviewImage,
  } = useSellerFlow();
  const { startChat } = useChat();
  const pathname = usePathname();
  const router = useRouter();
  const { navigateTo } = useNavigation();
  const { currentView: zeroUiScreen, setScreen, goToMarketplace, openMicroPayment, activeBoost } = useZeroUiScreen();
  const {
    buildAgentContext,
    noteUserMessage,
    recordSearchFilters,
    clearSearchFilters,
    activeSearchFilters,
  } = useZeroUiMemory();

  const myListingsForAgent = useMemo(
    () => compactMyListingsForAgent(listings, user.id),
    [listings, user.id]
  );

  const currentPageContext = useMemo(
    () =>
      buildCurrentPageContext({
        pathname,
        zeroUiScreen,
        listings,
        sellerId: user.id,
      }),
    [pathname, zeroUiScreen, listings, user.id]
  );

  const sellerWizardContext = useMemo(() => {
    if (!aiDraft) return {};
    const profileSyncedDraft =
      isAuthenticated && hasProfileListingContact(user)
        ? injectProfileContactsForPublish(aiDraft, user)
        : aiDraft;
    const profileContact = buildProfileListingContact(user);
    return {
      wizardMode:
        sellerStep === "idle"
          ? ("idle" as const)
          : ("listing_review" as const),
      listingDraft: {
        title: profileSyncedDraft.title,
        description: profileSyncedDraft.description,
        price: profileSyncedDraft.price,
        location: profileSyncedDraft.location,
        category: profileSyncedDraft.category,
        contact: profileSyncedDraft.contact || profileContact.contact,
        attributes: profileSyncedDraft.attributes as Record<string, string> | undefined,
        allowPastomatas: profileSyncedDraft.allowPastomatas,
        listingFlowState: profileSyncedDraft.listingFlowState,
        // Never ship gallery data URLs in every agent turn — vision uses pendingImageUrls.
        orderedImageUrls: undefined,
      },
      profileContacts: {
        userId: user.id,
        phone: user.phone?.trim() || undefined,
        email: user.email?.trim() || undefined,
        contact: profileContact.contact || undefined,
        syncedFromProfile: hasProfileListingContact(user),
      },
    };
  }, [aiDraft, sellerStep, isAuthenticated, user]);

  const [open, setOpen] = useState(false);
  const [streamThinkingLabel, setStreamThinkingLabel] = useState("Galvoju…");
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [hidePrePublishCard, setHidePrePublishCard] = useState(false);
  const [listingPublishConfirmed, setListingPublishConfirmed] = useState(false);

  const [busy, setBusy] = useState(false);
  const busyGateRef = useRef<ReturnType<typeof createAgentBusyGate> | null>(null);
  if (!busyGateRef.current) {
    busyGateRef.current = createAgentBusyGate(setBusy);
  }
  const busyGate = busyGateRef.current;

  useEffect(() => {
    conductorSetAgentBusy(busy);
  }, [busy]);

  const sendAgentMessageRef = useRef<
    (text: string, options?: AgentSendOptions) => Promise<WakeWordAgentResult>
  >(() => Promise.resolve({ ok: false, error: "Agentas dar neinicializuotas" }));
  const handleDirectAgentChipRef = useRef<(chip: string) => Promise<boolean>>(
    async () => false
  );
  const [sessionPendingImageUrls, setSessionPendingImageUrls] = useState<string[]>([]);
  const backgroundScanSeenRef = useRef<Set<string>>(new Set());
  const [lastBargainingOffer, setLastBargainingOffer] =
    useState<AgentBargainingOffer | null>(null);
  const adminProjectContext = useAdminProjectContextForAgent();
  const includeAdminContext = Boolean(adminProjectContext);
  const [lastError, setLastError] = useState<
    { code: string; message?: string } | undefined
  >();

  const routeZeroUiScreen = useCallback(
    (screen: ZeroUiScreen) => {
      if (typeof window !== "undefined") {
        persistPendingZeroUiScreen(screen);
        const path = window.location.pathname.replace(/\/$/, "") || "/";
        if (path !== "/") {
          router.push("/");
        }
      }
      setScreen(screen, "agent");
    },
    [setScreen, router]
  );

  const navigateToAdd = useCallback(
    (fashion = false) => {
      if (fashion) activateWardrobeSpinta();
      if (isOnAddListingPath(fashion)) return;
      pushAddListing(router, fashion);
    },
    [router, activateWardrobeSpinta]
  );

  const broadenSearch = useCallback(() => {
    goToMarketplace("agent");
    clearSearchFilters();
    setMarketplaceFilters({
      ...marketplaceFilters,
      category: "all",
      condition: "all",
      radiusKm: snapRadiusKm((marketplaceFilters.radiusKm ?? 10) + 20),
    });
  }, [goToMarketplace, clearSearchFilters, setMarketplaceFilters, marketplaceFilters]);

  /** Search/browse commands must never leave seller wizard or /add listing pipeline active. */
  const exitListingPipelineForMarketplaceSearch = useCallback(() => {
    cancelSellerFlow();
    goToMarketplace("agent");
    setOpen(false);
    if (
      pathname?.startsWith("/add") ||
      pathname?.startsWith("/fashion/mine")
    ) {
      router.push("/");
    }
  }, [cancelSellerFlow, goToMarketplace, setOpen, pathname, router]);

  const dispatchBrowseAllMarketplaceState = useCallback(() => {
    applyBrowseAllMarketplaceState({
      setSearchQuery,
      setAgentPinnedListings,
      clearSearchFilters,
      resetMarketplaceFilters,
      clearVisualSearch,
      setSearchInputMode,
      setSearchVoiceMode,
      setViewMode,
    });
  }, [
    setSearchQuery,
    setAgentPinnedListings,
    clearSearchFilters,
    resetMarketplaceFilters,
    clearVisualSearch,
    setSearchInputMode,
    setSearchVoiceMode,
    setViewMode,
  ]);

  const registerWantedFlow = useCallback(
    (query: string) => {
      void registerWanted({
        query,
        isAuthenticated,
        openAuthModal,
        subscribeWishlist,
        onSuccess: (msg) => showToast(msg, "success"),
        onError: (msg) => showToast(msg, "info"),
      });
    },
    [isAuthenticated, openAuthModal, subscribeWishlist, showToast]
  );

  const openBargainingChat = useCallback(() => {
    if (!lastBargainingOffer) return false;
    const chatId = startChat(lastBargainingOffer.listingId);
    if (!chatId) return false;
    router.push(chatThreadPath(chatId));
    return true;
  }, [lastBargainingOffer, startChat, router]);

  const searchSimilarListings = useCallback(() => {
    const q = (lastBargainingOffer?.listingTitle || searchQuery).trim();
    goToMarketplace("agent");
    setSearchInputMode("text");
    if (q) {
      setSearchQuery(q);
      setMarketplaceFilters({
        ...marketplaceFilters,
        category: "all",
      });
    }
  }, [
    lastBargainingOffer,
    searchQuery,
    goToMarketplace,
    setSearchInputMode,
    setSearchQuery,
    setMarketplaceFilters,
    marketplaceFilters,
  ]);

  const applyActions = useCallback(
    (rawActions: import("@/lib/vauto-agent-client").VautoAgentAction) => {
      const sanitized = sanitizeAgentAction(rawActions);
      if (!sanitized.ok) {
        showToast(sanitized.message, "info");
        return;
      }
      const actions = sanitized.action;
      if (actions.type === "none") return;

      setSearchQuery("");

      try {
      if (actions.type === "search") {
        goToMarketplace("agent");
        setOpen(false);
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        setSearchQuery("");
        setAgentPinnedListings(actions.listingIds);
        if (actions.filters) {
          setMarketplaceFilters(
            mergeAgentIntoMarketplaceFilters(
              marketplaceFilters,
              actions.filters,
              {
                resetAbsentGeo: true,
                resetAbsentCondition: true,
                resetAbsentCategory: true,
              }
            )
          );
        } else if (actions.searchQuery) {
          setMarketplaceFilters(
            mergeAgentIntoMarketplaceFilters(
              marketplaceFilters,
              { query: actions.searchQuery },
              {
                resetAbsentGeo: true,
                resetAbsentCondition: true,
                resetAbsentCategory: true,
              }
            )
          );
        }
        const nextFilters = filtersFromSearchAction(actions);
        if (actions.filtersReset) {
          clearSearchFilters();
        }
        if (nextFilters) recordSearchFilters(nextFilters);
        trackEvent("agent_action", {
          action: "search",
          query:
            resolveAgentDisplayQuery(actions.filters, actions.searchQuery) ||
            searchQuery,
          resultCount: actions.listingIds.length,
        });
        if (actions.listingIds.length) {
          showToast(`Rasta ${actions.listingIds.length} skelbimų`, "success");
        }
        window.setTimeout(() => focusSearchOutcome(actions.listingIds.length), 120);
      }
      if (actions.type === "browse_all") {
        if (
          sellerStep === "confirmation" ||
          sellerStep === "published" ||
          isPublishingListing
        ) {
          return;
        }
        exitListingPipelineForMarketplaceSearch();
        dispatchBrowseAllMarketplaceState();
        trackEvent("agent_action", {
          action: "browse_all",
          listingCount: actions.listingCount ?? null,
        });
        showToast(actions.replyMessage, "success");
        window.setTimeout(() => focusSearchOutcome(actions.listingCount ?? 1), 120);
      }
      if (actions.type === "listing_draft") {
        if (resolveBrowseAllIntent(searchQuery)) {
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
        const photoUrls = [
          ...(actions.imageUrls ?? []),
          ...(actions.imageUrl ? [actions.imageUrl] : []),
          ...(aiDraft?.orderedImageUrls ?? []),
        ]
          .map((u) => String(u ?? "").trim())
          .filter(Boolean)
          .filter((u, i, arr) => arr.indexOf(u) === i)
          .slice(0, 6);
        const proposedFlow =
          actions.listingDraft.listingFlowState ??
          (photoUrls.length || actions.listingDraft.title
            ? ("DRAFT_READY" as const)
            : ("DRAFTING_TEXT" as const));
        const flowState =
          resolveLockedListingFlowState(aiDraft?.listingFlowState, proposedFlow) ??
          proposedFlow;
        const draft = {
          ...mapAgentDraftToListing(actions.listingDraft),
          ...(photoUrls.length ? { orderedImageUrls: photoUrls } : {}),
          listingFlowState: flowState,
        } as import("@/lib/types").AiExtractedListing;
        applyAgentListingDraft(draft, photoUrls[0] ?? actions.imageUrl);
        if (flowState === "AWAITING_CONFIRMATION") {
          setListingPublishConfirmed(true);
          setHidePrePublishCard(false);
        } else {
          setListingPublishConfirmed(false);
          if (flowState === "DRAFT_READY") {
            setHidePrePublishCard(true);
          }
        }
      }
      if (actions.type === "wardrobe_bulk") {
        const items = mapAgentWardrobeItems(actions.items);
        if (items.length) {
          applyAgentWardrobeBulk(items, {
            imageUrl: actions.imageUrl,
            voiceAnnouncement: actions.voiceAnnouncement,
          });
        }
      }
      if (actions.type === "block_listing" && actions.listingId) {
        setListingBanned(actions.listingId, true);
        showToast(
          actions.listingTitle
            ? `AI užblokavo: ${actions.listingTitle}`
            : `Skelbimas užblokuotas (${actions.listingId})`,
          "success"
        );
      }
      if (actions.type === "empty_search") {
        if (resolveBrowseAllIntent(actions.searchQuery)) {
          dispatchBrowseAllMarketplaceState();
          return;
        }
        goToMarketplace("agent");
        setOpen(true);
        requestWizardAgentExpand();
        setAgentPinnedListings([]);
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        setSearchQuery("");
        if (actions.filters) {
          setMarketplaceFilters(
            mergeAgentIntoMarketplaceFilters(
              marketplaceFilters,
              actions.filters,
              {
                resetAbsentGeo: true,
                resetAbsentCondition: true,
                resetAbsentCategory: true,
              }
            )
          );
        }
        trackEvent("search_empty", {
          query:
            resolveAgentDisplayQuery(actions.filters, actions.searchQuery) ||
            searchQuery,
          filters: actions.filters ?? null,
        });
        trackEvent("agent_action", {
          action: "empty_search",
          query:
            resolveAgentDisplayQuery(actions.filters, actions.searchQuery) ||
            searchQuery,
        });
        window.setTimeout(() => focusSearchOutcome(0), 120);
      }
      if (actions.type === "register_wanted") {
        void registerWanted({
          query: actions.query,
          isAuthenticated,
          openAuthModal,
          subscribeWishlist,
          onSuccess: (msg) => showToast(msg, "success"),
          onError: (msg) => showToast(msg, "error"),
        });
      }
      if (actions.type === "mark_listing_sold" && actions.listingId) {
        markListingSold(actions.listingId);
        showToast(
          actions.title
            ? `Skelbimas archyvuotas: ${actions.title}`
            : "Skelbimas pažymėtas parduotu",
          "success"
        );
      }
      if (actions.type === "toggle_favorite" && actions.listingId) {
        toggleSave(actions.listingId);
        showToast(
          actions.added ? "Pridėta į mėgstamiausius." : "Pašalinta iš mėgstamiausių.",
          "success"
        );
      }
      if (actions.type === "dismiss_listing") {
        if (actions.mode === "next") {
          window.dispatchEvent(new CustomEvent("vauto:listing-next"));
          document.getElementById("listing-results")?.scrollBy({ top: 420, behavior: "smooth" });
        } else {
          window.dispatchEvent(new CustomEvent("vauto:listing-dismiss"));
          window.history.back();
        }
      }
      if (actions.type === "apply_ui_filters") {
        if (actions.activateWardrobe) {
          activateWardrobeSpinta();
          trackEvent("spinta_enter", { source: "agent_ui_filters" });
        }
        goToMarketplace("agent");
        setOpen(false);
        clearVisualSearch({ keepInputMode: false });
        setSearchInputMode("text");
        setSearchVoiceMode(false);
        setAgentPinnedListings(null);
        setSearchQuery("");
        setMarketplaceFilters(
          mergeVoiceUiFilters(
            marketplaceFilters,
            actions.categoryAttributes,
            actions.filters
          )
        );
        if (actions.label) showToast(actions.label, "success");
        trackEvent("agent_action", {
          action: "apply_ui_filters",
          label: actions.label,
          category: actions.filters?.category,
        });
        window.setTimeout(() => focusSearchOutcome(0), 120);
      }
      if (actions.type === "navigate_to_screen") {
        const opensWardrobeBulkImport =
          Boolean(actions.activateWardrobe) &&
          (actions.view === "add_listing" || actions.view === "seller_wizard");
        if (actions.activateWardrobe) {
          activateWardrobeSpinta();
          trackEvent("spinta_enter", { source: "agent_navigate", screen: actions.screen });
        }
        if (!opensWardrobeBulkImport) {
          setOpen(false);
        }
        clearVisualSearch({ keepInputMode: false });
        setSearchInputMode("text");
        setSearchVoiceMode(false);
        if (actions.filters || actions.categoryAttributes) {
          setMarketplaceFilters(
            mergeVoiceUiFilters(
              marketplaceFilters,
              actions.categoryAttributes,
              actions.filters
            )
          );
        }
        if (actions.query?.trim() || actions.filters?.query?.trim()) {
          setSearchQuery("");
        }
        if (actions.zeroUi) {
          routeZeroUiScreen(actions.zeroUi);
        } else if (actions.view) {
          if (actions.view === "add_listing" || actions.view === "seller_wizard") {
            navigateToAdd(Boolean(actions.activateWardrobe));
          } else if (actions.view === "profile") {
            routeZeroUiScreen("business_dashboard");
          } else {
            navigateTo(actions.view, {}, { source: "agent", zeroUi: false });
          }
        }
        if (typeof window !== "undefined" && actions.path) {
          const target = actions.path.replace(/\/$/, "") || "/";
          const current = window.location.pathname.replace(/\/$/, "") || "/";
          if (target !== current) {
            router.push(actions.path);
          } else {
            goToMarketplace("agent");
          }
        }
        if (actions.label) showToast(actions.label, "success");
        if (opensWardrobeBulkImport) {
          notifyWardrobeBulkImportOpened(WARDROBE_BULK_IMPORT_GREETING, {
            quickReplies: [...WARDROBE_BULK_IMPORT_CHIPS],
          });
        }
        trackEvent("agent_action", {
          action: "navigate_to_screen",
          screen: actions.screen,
          path: actions.path,
        });
        window.setTimeout(() => focusSearchOutcome(0), 120);
      }
      if (actions.type === "create_user_requirement") {
        if (actions.needsAuth) {
          openAuthModal("/");
          showToast(
            actions.label ??
              "Prisijunk — tada užfiksuosiu tavo norą ir pranešiu, kai atsiras!",
            "info"
          );
          trackEvent("agent_action", {
            action: "create_user_requirement",
            needsAuth: true,
            query: actions.query,
          });
          return;
        }
        if (actions.requirementId) {
          void subscribeWishlist(actions.query);
          showToast(
            actions.label ??
              `Pageidavimas „${actions.query}" užfiksuotas — stebėsiu rinką fone!`,
            "success"
          );
          trackEvent("agent_action", {
            action: "create_user_requirement",
            requirementId: actions.requirementId,
            query: actions.query,
          });
        } else if (actions.requirement && isAuthenticated) {
          void apiCreateUserRequirement({
            ...actions.requirement,
            source: "agent_client",
          }).then((res) => {
            if (res.ok) {
              void subscribeWishlist(actions.query);
              showToast(
                actions.label ??
                  `Pageidavimas „${actions.query}" užfiksuotas fone!`,
                "success"
              );
            }
          });
        }
      }
      if (actions.type === "propose_bargaining") {
        setLastBargainingOffer({
          listingId: actions.listingId,
          listingTitle: actions.listingTitle,
          listingPrice: actions.listingPrice,
          suggestedOfferMin: actions.suggestedOfferMin,
          suggestedOfferMax: actions.suggestedOfferMax,
        });
        trackEvent("agent_action", {
          action: "propose_bargaining",
          listingId: actions.listingId,
          suggestedOfferMin: actions.suggestedOfferMin,
          suggestedOfferMax: actions.suggestedOfferMax,
        });
        if (actions.label) showToast(actions.label, "info");
        if (actions.openChat) {
          const chatId = startChat(actions.listingId);
          if (chatId) {
            router.push(chatThreadPath(chatId));
          }
        }
      }
      if (actions.type === "micro_payment") {
        openMicroPayment({
          reason: actions.reason,
          price: actions.price,
          product: actions.product,
          voiceConfirmPhrase: actions.voiceConfirmPhrase,
        });
        navigateToAdd();
      }
      if (actions.type === "zero_ui_screen") {
        routeZeroUiScreen(actions.screen);
        showToast(`Zero-UI: ${actions.screen.replace(/_/g, " ")}`, "info");
      }
        if (actions.type === "navigate") {
        const view = actions.view;
        if (view === "add_listing" || view === "seller_wizard") {
          const fashion = Boolean(actions.params?.vertical === "fashion");
          navigateToAdd(fashion);
          if (fashion) {
            notifyWardrobeBulkImportOpened(WARDROBE_BULK_IMPORT_GREETING, {
              quickReplies: [...WARDROBE_BULK_IMPORT_CHIPS],
            });
          }
        } else if (view === "profile") {
          routeZeroUiScreen("business_dashboard");
        } else if (view === "admin_ai") {
          routeZeroUiScreen("admin_panel");
        } else if (view === "search_results" || view === "home" || view === "discover") {
          goToMarketplace("agent");
        } else {
          navigateTo(view, actions.params ?? {}, { source: "agent", zeroUi: false });
        }
        if (actions.params?.query) {
          setSearchInputMode("text");
          setSearchQuery(actions.params.query);
        }
        if (view !== "search_results" && view !== "home" && view !== "discover") {
          showToast(`Atidaromas: ${viewTitle(view)}`, "info");
        }
      }
      } catch (err) {
        console.error("[VAUTO applyActions]", err);
        showToast(
          "Nepavyko atlikti AI veiksmo — bandykite dar kartą arba patikslinkite užklausą.",
          "info"
        );
      }
    },
    [
      markListingSold,
      applyAgentListingDraft,
      applyAgentWardrobeBulk,
      goToMarketplace,
      isAuthenticated,
      user,
      navigateTo,
      openAuthModal,
      routeZeroUiScreen,
      router,
      navigateToAdd,
      setListingBanned,
      setSearchInputMode,
      setSearchQuery,
      showToast,
      subscribeWishlist,
      recordSearchFilters,
      clearSearchFilters,
      openMicroPayment,
      setAgentPinnedListings,
      setMarketplaceFilters,
      marketplaceFilters,
      clearVisualSearch,
      toggleSave,
      setSearchVoiceMode,
      activateWardrobeSpinta,
      trackEvent,
      startChat,
      setLastBargainingOffer,
      exitListingPipelineForMarketplaceSearch,
      dispatchBrowseAllMarketplaceState,
      searchQuery,
      sellerStep,
      isPublishingListing,
      setListingPublishConfirmed,
      setHidePrePublishCard,
      aiDraft,
    ]
  );

  const teardownVoiceAfterUiAction = useCallback(
    async (actions: import("@/lib/vauto-agent-client").VautoAgentAction) => {
      if (!isUiDrivingAgentAction(actions)) return;
      setSearchInputMode("text");
      setSearchVoiceMode(false);
      await completeVoiceTeardown();
    },
    [setSearchInputMode, setSearchVoiceMode]
  );

  const resetPublishSessionRef = useRef<() => void>(() => {});

  const resetPublishSession = useCallback(() => {
    setListingPublishConfirmed(false);
    setHidePrePublishCard(false);
    // Strip PrePublish card only — success copy comes from notifyListingPublishComplete (one message).
    setMessages((prev) =>
      prev
        .map((m) => {
          if (m.role !== "assistant" || !m.prePublishCard) return m;
          const { prePublishCard, ...rest } = m;
          void prePublishCard;
          return rest;
        })
        .slice(-6)
    );
    touchAgentSessionActivity();
  }, []);

  useEffect(() => {
    resetPublishSessionRef.current = resetPublishSession;
  }, [resetPublishSession]);

  /**
   * Brutal deterministic path: „Parduoti …“ chip → AWAITING_CONFIRMATION + PrePublish.
   * No server, no LLM, no photos-nudge. Local state only.
   */
  const commitVisionObjectSellToPrePublish = useCallback(
    (chip: string): WakeWordAgentResult => {
      const trimmed = chip.trim();
      const noun = nounFromVisionObjectSellChip(trimmed);
      const title = noun
        ? noun.charAt(0).toUpperCase() + noun.slice(1)
        : aiDraft?.title?.trim() || "Prekė";
      const objects = parseDetectedObjectsFromAttributes(aiDraft?.attributes);
      const matched = noun
        ? objects.find((o) => o.label.toLowerCase() === noun.toLowerCase())
        : undefined;
      const photos = [
        ...(aiDraft?.orderedImageUrls ?? []),
        ...(sellerPreviewImage ? [sellerPreviewImage] : []),
        ...sessionPendingImageUrls,
      ]
        .map((u) => String(u ?? "").trim())
        .filter(Boolean)
        .filter((u, i, arr) => arr.indexOf(u) === i)
        .slice(0, 6);

      const baseDraft = {
        title,
        description: aiDraft?.description ?? "",
        price: aiDraft?.price ?? 0,
        location: aiDraft?.location?.trim() || user.city?.trim() || "",
        contact: aiDraft?.contact?.trim() || user.phone?.trim() || "",
        category:
          (matched?.category as import("@/lib/types").AiExtractedListing["category"]) ??
          aiDraft?.category ??
          "other",
        confidence: aiDraft?.confidence ?? 0.85,
        attributes: {
          ...(aiDraft?.attributes ?? {}),
          choiceChips: undefined,
          clarificationPrompt: undefined,
          ...(noun ? { selectedObject: noun } : {}),
        },
        ...(photos.length ? { orderedImageUrls: photos } : {}),
        choiceChips: undefined,
        clarificationPrompt: undefined,
        ...(aiDraft?.priceLabel ? { priceLabel: aiDraft.priceLabel } : {}),
        ...(aiDraft?.allowPastomatas != null
          ? { allowPastomatas: aiDraft.allowPastomatas }
          : {}),
      } as import("@/lib/types").AiExtractedListing;

      const readiness = evaluatePrePublishReadiness({
        isAuthenticated,
        user,
        draft: baseDraft,
        previewImage: sellerPreviewImage ?? photos[0] ?? null,
        pendingImageUrls: sessionPendingImageUrls,
        orderedImageUrls: photos,
        geoCoords: buyerCoords,
      });

      /**
       * Lock PrePublish ONLY when the card can actually render.
       * Missing price/city/phone → stay DRAFT_READY so the seller can type.
       */
      if (!readiness.ok) {
        const draftingDraft = {
          ...(readiness.syncedDraft ?? baseDraft),
          listingFlowState: "DRAFT_READY" as const,
          choiceChips: undefined,
          clarificationPrompt: undefined,
          ...(photos.length ? { orderedImageUrls: photos } : {}),
        };
        applyAgentListingDraft(draftingDraft, photos[0]);
        setListingPublishConfirmed(false);
        setHidePrePublishCard(true);
        updateAiDraft(draftingDraft);
        const reply = buildConversationalMissingPrompt(readiness);
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          { role: "assistant" as const, text: reply, quickReplies: undefined },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      const card = buildPrePublishCardPayload(
        readiness,
        sellerPreviewImage ?? photos[0] ?? null,
        { vatCode: user.vatCode, pendingImageUrls: sessionPendingImageUrls }
      );
      if (!card) {
        const draftingDraft = {
          ...(readiness.syncedDraft ?? baseDraft),
          listingFlowState: "DRAFT_READY" as const,
          choiceChips: undefined,
          clarificationPrompt: undefined,
          ...(photos.length ? { orderedImageUrls: photos } : {}),
        };
        applyAgentListingDraft(draftingDraft, photos[0]);
        setListingPublishConfirmed(false);
        setHidePrePublishCard(true);
        updateAiDraft(draftingDraft);
        const reply = buildConversationalMissingPrompt(readiness);
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          { role: "assistant" as const, text: reply, quickReplies: undefined },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      const patchedDraft = {
        ...(readiness.syncedDraft ?? baseDraft),
        listingFlowState: "AWAITING_CONFIRMATION" as const,
        choiceChips: undefined,
        clarificationPrompt: undefined,
        ...(photos.length ? { orderedImageUrls: photos } : {}),
      } as import("@/lib/types").AiExtractedListing;

      applyAgentListingDraft(patchedDraft, photos[0]);
      setListingPublishConfirmed(true);
      setHidePrePublishCard(false);
      updateAiDraft(patchedDraft);

      const reply = PRE_PUBLISH_CARD_INTRO;

      setMessages((prev) => [
        ...prev,
        { role: "user" as const, text: trimmed },
        {
          role: "assistant" as const,
          text: reply,
          prePublishCard: card,
          quickReplies: undefined,
        },
      ]);
      touchAgentSessionActivity();
      return { ok: true, reply };
    },
    [
      aiDraft,
      applyAgentListingDraft,
      buyerCoords,
      isAuthenticated,
      sellerPreviewImage,
      sessionPendingImageUrls,
      updateAiDraft,
      user,
    ]
  );

  const sendAgentMessage = useCallback(
    async (
      text: string,
      options?: AgentSendOptions
    ): Promise<WakeWordAgentResult> => {
      const trimmed = text.trim();
      const hasIncomingImages = Boolean(
        options?.pendingImageUrls?.filter(Boolean).length ||
          options?.sessionImageUrls?.filter(Boolean).length
      );
      if (!trimmed && !hasIncomingImages) {
        return { ok: false, error: "Tuščia užklausa" };
      }

      // Hard local lock — never let „Parduoti …“ hit the server photos-nudge loop.
      if (trimmed && isVisionObjectSellChip(trimmed) && !hasIncomingImages) {
        return commitVisionObjectSellToPrePublish(trimmed);
      }

      const drainAgentQueue = () => {
        const next = busyGate.drainNext();
        if (next) {
          void sendAgentMessageRef.current(next.text, next.options).then(next.resolve);
        }
      };

      if (!options?.skipBusyCheck && busyGate.locked) {
        return await new Promise<WakeWordAgentResult>((resolve) => {
          const status = busyGate.enqueue(trimmed, options, resolve);
          if (status === "full") {
            resolve({ ok: false, error: AGENT_QUEUE_FULL_MESSAGE });
          }
        });
      }

      const voiceReply = false;
      const speakReply = (_replyText?: string) => {
        void _replyText;
        /* v1.2 — text-only assistant, no TTS */
      };

      // Hero SM chips (vision pick / publish gate) are handled below via dispatchListingFlowTurn.
      // Do not route them through handleDirectAgentChip (would recurse via sendAgentMessageRef).
      const isHeroSmChip =
        isVisionObjectSellChip(trimmed) ||
        /^viskas\b/i.test(trimmed) ||
        /\bpublikuojam\b/i.test(trimmed) ||
        /\bprepublish\b/i.test(trimmed) ||
        /\bjudame\s+prie\b/i.test(trimmed) ||
        /^nenoriu\b/i.test(trimmed) ||
        /^prisegti\s+nuotrauk/i.test(trimmed) ||
        /^įkelti\s+dar\s+nuotrauk/i.test(trimmed);
      if (isDirectAgentActionChip(trimmed) && !isHeroSmChip) {
        const handled = await handleDirectAgentChipRef.current(trimmed);
        if (handled) return { ok: true, reply: "" };
      }

      if (resolveBrowseAllIntent(trimmed)) {
        dispatchBrowseAllMarketplaceState();
        const activeCount = listings.filter(
          (l) => !l.banned && l.price > 0 && l.status !== "sold"
        ).length;
        const actions = createBrowseAllAction(activeCount);
        setMessages((prev) =>
          [
            ...prev,
            { role: "user" as const, text: trimmed },
            { role: "assistant" as const, text: actions.replyMessage },
          ].slice(-6)
        );
        speakReply(actions.replyMessage);
        applyActions(actions);
        touchAgentSessionActivity();
        return { ok: true, reply: actions.replyMessage, actions };
      }

      const listingChatContext = {
        hasListingDraft: Boolean(aiDraft),
        sellerFlowActive:
          sellerStep !== "idle" ||
          sellerVisionRecoveryActive ||
          Boolean(readListingEditSession()),
      };

      const runPrePublishGate = () => {
        const readiness = evaluatePrePublishReadiness({
          isAuthenticated,
          user,
          draft: aiDraft,
          previewImage: sellerPreviewImage,
          pendingImageUrls: sessionPendingImageUrls,
          orderedImageUrls: aiDraft?.orderedImageUrls,
          geoCoords: buyerCoords,
        });
        if (readiness.syncedDraft && aiDraft && readiness.syncedDraft !== aiDraft) {
          updateAiDraft(readiness.syncedDraft);
        }
        return readiness;
      };

      const requestPublishUpsell = (): {
        reply: string;
        quickReplies?: string[];
        prePublishCard?: import("@/lib/pre-publish-validation").PrePublishCardPayload;
      } => {
        const readiness = runPrePublishGate();
        if (!readiness.ok) {
          return { reply: buildConversationalMissingPrompt(readiness) };
        }
        return confirmPublishNow();
      };

      const confirmPublishNow = (): {
        reply: string;
        quickReplies?: string[];
        prePublishCard?: import("@/lib/pre-publish-validation").PrePublishCardPayload;
      } => {
        const readiness = runPrePublishGate();
        if (!readiness.ok) {
          return { reply: buildConversationalMissingPrompt(readiness) };
        }
        // Verbal „tinka/gerai/publikuoti“ ONLY opens PrePublish preview.
        // NEVER call publishListing here — wait for „Patvirtinti ir publikuoti“ button.
        const card = buildPrePublishCardPayload(readiness, sellerPreviewImage);
        if (card) {
          setListingPublishConfirmed(true);
          setHidePrePublishCard(false);
          return {
            reply: PRE_PUBLISH_CARD_INTRO,
            prePublishCard: card,
          };
        }
        return {
          reply:
            "Skelbimo peržiūros dar nepavyko paruošti — papildykite kainą, miestą ar nuotrauką ir parašykite „tinka“ dar kartą.",
        };
      };

      const buildPrePublishMissingGuideReply = (): string => {
        const readiness = runPrePublishGate();
        return buildConversationalMissingPrompt(readiness);
      };

      if (isManualFillIntent(trimmed)) {
        const reply = buildManualFillChatRedirectReply();
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          { role: "assistant" as const, text: reply },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      /** Merge photos + price from this turn BEFORE SM so PrePublish can open with media+price. */
      const visionIncoming =
        options?.pendingImageUrls?.filter(Boolean).slice(0, 6) ?? [];
      const sessionIncoming = (
        options?.sessionImageUrls?.length
          ? options.sessionImageUrls
          : options?.pendingImageUrls
      )
        ?.filter(Boolean)
        .slice(0, 6) ?? [];
      const incomingImagesEarly = sessionIncoming.length
        ? sessionIncoming
        : visionIncoming;
      const priceFromTurn = trimmed ? parsePriceFromChatInput(trimmed) : null;
      let draftForTurn = aiDraft
        ? priceFromTurn != null && !(aiDraft.price > 0)
          ? { ...aiDraft, price: priceFromTurn }
          : priceFromTurn != null && aiDraft.price !== priceFromTurn
            ? { ...aiDraft, price: priceFromTurn }
            : aiDraft
        : null;
      if (draftForTurn && priceFromTurn != null && draftForTurn.price === priceFromTurn) {
        updateAiDraft({ price: priceFromTurn });
      }
      let pendingForTurn = sessionPendingImageUrls;
      if (incomingImagesEarly.length) {
        pendingForTurn = [...incomingImagesEarly, ...sessionPendingImageUrls]
          .filter(Boolean)
          .filter((u, i, arr) => arr.indexOf(u) === i)
          .slice(0, 6);
        setSessionPendingImageUrls(pendingForTurn);
        setListingPublishConfirmed(false);
        if (draftForTurn) {
          const mergedPhotos = [
            ...incomingImagesEarly,
            ...(draftForTurn.orderedImageUrls ?? []),
          ]
            .filter(Boolean)
            .filter((u, i, arr) => arr.indexOf(u) === i)
            .slice(0, 6);
          draftForTurn = { ...draftForTurn, orderedImageUrls: mergedPhotos };
          updateAiDraft({
            orderedImageUrls: mergedPhotos,
            ...(priceFromTurn != null ? { price: priceFromTurn } : {}),
          });
        }
      }

      const photoCount = Math.max(
        sellerPreviewImage ? 1 : 0,
        draftForTurn?.orderedImageUrls?.length ?? 0,
        pendingForTurn.length,
        hasIncomingImages ? 1 : 0
      );
      const listingFlowState = inferListingFlowState({
        listingFlowState: draftForTurn?.listingFlowState,
        hasDraft: Boolean(draftForTurn?.title?.trim() || draftForTurn),
        photoCount,
      });
      const flowDecision = dispatchListingFlowTurn({
        state: listingFlowState,
        userText: trimmed,
        hasIncomingPhotos: hasIncomingImages,
        photoCount,
        hasDraft: Boolean(draftForTurn),
      });

      // Text-first sell/generate: reopen drafting so Gemini can enrich without photos.
      if (
        flowDecision.kind === "allow_drafting" &&
        listingFlowState === "AWAITING_PHOTOS" &&
        shouldBypassPhotosNudge(trimmed) &&
        draftForTurn
      ) {
        updateAiDraft({ listingFlowState: "DRAFTING_TEXT" });
        draftForTurn = { ...draftForTurn, listingFlowState: "DRAFTING_TEXT" };
      }

      if (flowDecision.kind === "ignore_backward") {
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          { role: "assistant" as const, text: flowDecision.reply },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply: flowDecision.reply };
      }

      if (flowDecision.kind === "nudge_photos") {
        // Hard bypass — never trap text-first generation in the photos loop.
        if (shouldBypassPhotosNudge(trimmed) && !hasIncomingImages) {
          if (aiDraft) {
            updateAiDraft({ listingFlowState: "DRAFTING_TEXT" });
          }
          // Fall through to proactive agent / API below.
        } else if (
          photoCount > 0 &&
          flowDecision.reply === AWAITING_PHOTOS_NUDGE
        ) {
          if (draftForTurn && draftForTurn.listingFlowState !== "DRAFT_READY") {
            updateAiDraft({ listingFlowState: "DRAFT_READY" });
          }
          setMessages((prev) => [
            ...prev,
            { role: "user" as const, text: trimmed },
            {
              role: "assistant" as const,
              text: POST_VISION_PUBLISH_GATE,
              quickReplies: [...POST_VISION_PUBLISH_CHIPS],
            },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply: POST_VISION_PUBLISH_GATE };
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "user" as const, text: trimmed },
            { role: "assistant" as const, text: flowDecision.reply || AWAITING_PHOTOS_NUDGE },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply: flowDecision.reply || AWAITING_PHOTOS_NUDGE };
        }
      }

      // show_draft_gate / show_description must NEVER short-circuit the AI —
      // DRAFT_READY custom chat falls through to the stream below.

      /** Multi-object pick → PrePublish immediately (local only). */
      if (flowDecision.kind === "object_selected") {
        return commitVisionObjectSellToPrePublish(trimmed);
      }

      if (flowDecision.kind === "show_confirmation" && draftForTurn) {
        const priceFromMsg = parsePriceFromChatInput(trimmed);
        const draftWithPrice =
          priceFromMsg != null &&
          (!(draftForTurn.price > 0) || draftForTurn.price !== priceFromMsg)
            ? { ...draftForTurn, price: priceFromMsg }
            : draftForTurn;

        const readiness = evaluatePrePublishReadiness({
          isAuthenticated,
          user,
          draft: draftWithPrice,
          previewImage: sellerPreviewImage,
          pendingImageUrls: pendingForTurn,
          orderedImageUrls: draftWithPrice.orderedImageUrls,
          geoCoords: buyerCoords,
        });

        /** Never lock the composer without a real PrePublish card. */
        if (!readiness.ok) {
          const draftingDraft = {
            ...(readiness.syncedDraft ?? draftWithPrice),
            listingFlowState: "DRAFT_READY" as const,
            choiceChips: undefined,
            clarificationPrompt: undefined,
          };
          updateAiDraft(draftingDraft);
          setListingPublishConfirmed(false);
          setHidePrePublishCard(true);
          const reply = buildConversationalMissingPrompt(readiness);
          setMessages((prev) => [
            ...prev,
            { role: "user" as const, text: trimmed || "publikuojam" },
            { role: "assistant" as const, text: reply, quickReplies: undefined },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply };
        }

        const nextState =
          transitionListingFlow(
            draftWithPrice.listingFlowState ?? listingFlowState ?? "DRAFT_READY",
            "READY_TO_PUBLISH"
          ) ?? "AWAITING_CONFIRMATION";
        const patchedDraft = {
          ...(readiness.syncedDraft ?? draftWithPrice),
          listingFlowState: nextState as typeof draftWithPrice.listingFlowState,
          choiceChips: undefined,
          clarificationPrompt: undefined,
        };

        const cardPhotos = [
          ...(patchedDraft.orderedImageUrls ?? []),
          ...pendingForTurn,
          ...(sellerPreviewImage ? [sellerPreviewImage] : []),
        ]
          .map((u) => String(u ?? "").trim())
          .filter(Boolean)
          .filter((u, i, arr) => arr.indexOf(u) === i)
          .slice(0, 6);
        const card = buildPrePublishCardPayload(
          readiness,
          sellerPreviewImage ?? cardPhotos[0] ?? null,
          { vatCode: user.vatCode, pendingImageUrls: pendingForTurn }
        );
        // Never lock composer without a real card payload.
        if (!card) {
          updateAiDraft({
            ...patchedDraft,
            listingFlowState: "DRAFT_READY",
            ...(cardPhotos.length ? { orderedImageUrls: cardPhotos } : {}),
          });
          setListingPublishConfirmed(false);
          setHidePrePublishCard(true);
          const reply = buildConversationalMissingPrompt(readiness);
          setMessages((prev) => [
            ...prev,
            { role: "user" as const, text: trimmed || "publikuojam" },
            { role: "assistant" as const, text: reply, quickReplies: undefined },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply };
        }

        updateAiDraft({
          ...patchedDraft,
          ...(cardPhotos.length ? { orderedImageUrls: cardPhotos } : {}),
          listingFlowState: nextState as typeof draftWithPrice.listingFlowState,
        });
        setListingPublishConfirmed(true);
        setHidePrePublishCard(false);
        const reply = PRE_PUBLISH_CARD_INTRO;

        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed || "publikuojam" },
          {
            role: "assistant" as const,
            text: reply,
            prePublishCard: card,
            quickReplies: undefined,
          },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      // Edit chips must not roll the state machine backward.
      if (
        aiDraft &&
        isEditActionChip(trimmed) &&
        listingFlowState !== "AWAITING_CONFIRMATION" &&
        listingFlowState !== "AWAITING_PHOTOS" &&
        listingFlowState !== "DRAFT_READY"
      ) {
        const editField = editFieldFromChip(trimmed);
        if (editField) {
          setAwaitingListingEditField(editField);
          setHidePrePublishCard(true);
          const reply = buildListingEditPrompt(editField);
          setMessages((prev) => [
            ...(isDirectAgentActionChip(trimmed) ? prev : [...prev, { role: "user" as const, text: trimmed }]),
            {
              role: "assistant" as const,
              text: reply,
              quickReplies: buildListingEditQuickReplies(),
            },
          ].slice(-6));
          touchAgentSessionActivity();
          return { ok: true, reply };
        }
      }

      // Field mutations only while drafting — never trap text-first generate/sell here.
      const listingChatReply =
        flowDecision.kind === "allow_drafting" &&
        aiDraft &&
        !shouldBypassPhotosNudge(trimmed) &&
        isListingConversationInput(trimmed, listingChatContext)
          ? tryApplyListingChatInput(trimmed, aiDraft, (patch) => {
              const nextState =
                transitionListingFlow(
                  aiDraft.listingFlowState ?? "DRAFTING_TEXT",
                  "DRAFT_SAVED"
                ) ?? "DRAFT_READY";
              updateAiDraft({
                ...patch,
                listingFlowState: nextState,
              });
            })
          : null;
      if (listingChatReply) {
        const reply = buildDraftingCompletePhotosPrompt({
          title: aiDraft?.title,
          description: aiDraft?.description,
          price: aiDraft?.price,
          location: aiDraft?.location,
        });
        setListingPublishConfirmed(false);
        setHidePrePublishCard(true);
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          {
            role: "assistant" as const,
            text: reply,
            quickReplies: [...POST_VISION_PUBLISH_CHIPS],
          },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      // Photo-only (or photo + short caption) must reach pendingImageUrls handling below.
      // Empty text is "too short" by design — do not treat media uploads as noise.
      if (
        !hasIncomingImages &&
        isTooShortAgentQuery(trimmed, {
          fromVoice: voiceReply,
          listingChat: listingChatContext,
        })
      ) {
        const reply = resolveAgentNoiseReply(trimmed);
        const shortUserMsg: AgentChatMessage = { role: "user", text: trimmed };
        setMessages((prev) => [
          ...prev,
          shortUserMsg,
          { role: "assistant", text: reply },
        ]);
        speakReply(reply);
        touchAgentSessionActivity();
        return { ok: true, reply };
      }

      const damageReply = tryHandleVisualDamageReply(trimmed, aiDraft, updateAiDraft);
      if (damageReply) {
        setOpen(true);
        setMessages((prev) => [
          ...prev,
          { role: "user", text: trimmed },
          { role: "assistant", text: damageReply },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply: damageReply };
      }

      const quickReply = tryHandleAgentQuickReply({
        trimmed,
        user,
        searchQuery,
        aiDraft,
        sellerStep,
        pendingWardrobeBulkItems,
        pendingWardrobeVoice,
        lastBargainingOffer,
        publishListing,
        requestPublishUpsell: () => {
          const r = requestPublishUpsell();
          return {
            handled: true,
            reply: r.reply,
            ...(r.quickReplies ? { quickReplies: r.quickReplies } : {}),
            ...(r.prePublishCard ? { prePublishCard: r.prePublishCard } : {}),
          };
        },
        confirmPublishNow: () => {
          const r = confirmPublishNow();
          return {
            handled: true,
            reply: r.reply,
            ...(r.quickReplies ? { quickReplies: r.quickReplies } : {}),
            ...(r.prePublishCard ? { prePublishCard: r.prePublishCard } : {}),
          };
        },
        buildPrePublishMissingGuide: buildPrePublishMissingGuideReply,
        getPrePublishReadiness: () =>
          aiDraft
            ? runPrePublishGate()
            : null,
        publishBulkClothingListings,
        applyAgentWardrobeBulk,
        activateWardrobeSpinta,
        routeZeroUiScreen,
        openMicroPayment,
        resolveSmartBoostPrice,
        navigateToAdd,
        applyAgentListingDraft,
        routerPush: (path) => router.push(path),
        goToDiscover: () => router.push("/discover"),
        broadenSearch,
        registerWantedFlow,
        openChats: () => router.push("/chats"),
        openBargainingChat,
        openAuthModal,
        searchSimilarListings,
        revertPhotoCategoryMismatch,
        acceptPhotoCategoryMismatch,
      });
      if (quickReply) {
        if (quickReply.prePublishCard) {
          setListingPublishConfirmed(true);
          setHidePrePublishCard(false);
        }
        if (!quickReply.reply.trim() && !quickReply.prePublishCard) {
          touchAgentSessionActivity();
          return { ok: true, reply: "" };
        }
        setMessages((prev) => [
          ...(isDirectAgentActionChip(trimmed) ? prev : [...prev, { role: "user" as const, text: trimmed }]),
          {
            role: "assistant" as const,
            text: quickReply.reply,
            ...(quickReply.quickReplies?.length ? { quickReplies: quickReply.quickReplies } : {}),
            ...(quickReply.prePublishCard ? { prePublishCard: quickReply.prePublishCard } : {}),
          },
        ].slice(-6));
        touchAgentSessionActivity();
        return { ok: true, reply: quickReply.reply };
      }

      const lastActiveAt = readAgentSessionLastActiveAt();
      const sessionExpired =
        isAgentSessionExpired(lastActiveAt) && messages.length > 1;
      const lastSessionTopic = sessionExpired
        ? extractLastSessionTopic(messages)
        : undefined;

      let conversationBase = messages;
      if (sessionExpired) {
        setSessionPendingImageUrls([]);
        setLastBargainingOffer(null);
        conversationBase = [
          {
            role: "assistant",
            text: buildWelcomeBackAgentGreeting(
              user.name,
              myListingsForAgent,
              lastSessionTopic ?? "skelbimus ar paiešką"
            ),
          },
        ];
      }

      const incomingImages = incomingImagesEarly.length
        ? incomingImagesEarly
        : undefined;
      const activePendingImageUrls =
        incomingImages ??
        (pendingForTurn.length ? pendingForTurn : undefined);
      // Wire only the tiny vision subset — full gallery already in session/draft.
      const requestPendingImageUrls = visionIncoming.length
        ? visionIncoming
        : incomingImages?.length
          ? selectAgentVisionUrls(incomingImages)
          : undefined;
      const pendingImageCount =
        pendingForTurn.length ||
        sessionPendingImageUrls.length ||
        incomingImages?.length ||
        0;
      const geoCityHint = buyerCoords
        ? nearestLtCityFromCoords(buyerCoords) || undefined
        : undefined;

      const proactiveOnly = Boolean(options?.proactiveTriggerOnly);
      const apiUserText = proactiveOnly
        ? `[Proaktyvi intervencija: ${options?.proactiveOffer?.kind ?? "assist"} — ${
            options?.proactiveOffer?.query?.trim() ||
            options?.proactiveOffer?.listingTitle?.trim() ||
            "padėk vartotojui proaktyviai"
          }]`
        : trimmed || (incomingImages?.length ? "[Nuotraukos įkeltos]" : trimmed);

      const userMsg: AgentChatMessage = {
        role: "user",
        text: apiUserText,
        ...(incomingImages?.length ? { imageUrls: incomingImages } : {}),
      };

      const nextMessages = proactiveOnly
        ? conversationBase
        : [...conversationBase, userMsg];

      if (!proactiveOnly && !options?.skipUserBubble) {
        setMessages((prev) => [...prev, userMsg].slice(-6));
      }
      noteUserMessage(trimmed);
      trackEvent("agent_message", {
        text: trimmed.slice(0, 120),
        fromVoice: voiceReply,
        fromSearchBar: Boolean(options?.fromSearchBar),
      });

      let proactiveContactConfirmation: string | null = null;
      let profileUser = user;
      if (!proactiveOnly && isAuthenticated) {
        const contactSync = await syncProfileContactsFromChat({
          text: trimmed,
          user,
          isAuthenticated,
          aiDraft,
          updateUser,
          updateAiDraft: aiDraft ? updateAiDraft : undefined,
        });
        proactiveContactConfirmation = contactSync.confirmation;
        profileUser = { ...user, ...contactSync.user };
        if (proactiveContactConfirmation && isContactOnlyUserMessage(trimmed)) {
          const parsed = parseListingContactFromText(trimmed);
          const contactReply = parsed.hasAny
            ? buildListingContactUpdateReply(parsed)
            : proactiveContactConfirmation;
          setMessages((prev) => {
            const usersOnly = prev.filter((m) => m.role === "user");
            return [
              ...usersOnly,
              { role: "assistant" as const, text: contactReply },
            ].slice(-6);
          });
          touchAgentSessionActivity();
          return { ok: true, reply: contactReply };
        }
      }

      const sessionMessages = options?.fromSearchBar
        ? [{ role: "user" as const, text: trimmed }]
        : selectAgentSessionMessages([
            ...nextMessages,
            ...(proactiveOnly
              ? [{ role: "user" as const, text: apiUserText }]
              : []),
          ]);
      const memoryContext = buildAgentContext(user);
      const searchSessionReset = shouldResetSearchSession(
        trimmed,
        activeSearchFilters
      );
      const resetFilters = searchSessionReset
        ? parseSearchFiltersFromUserText(trimmed)
        : null;

      if (searchSessionReset) {
        clearSearchFilters();
      }

      const viewIntent = parseViewModeIntent(trimmed);
      if (viewIntent) {
        setViewMode(viewIntent);
        if (isViewModeOnlyCommand(trimmed)) {
          const viewReply =
            viewIntent === "map"
              ? "Perjungiu į žemėlapio vaizdą."
              : viewIntent === "list"
                ? "Perjungiu į sąrašo vaizdą."
                : "Perjungiu į tinklelio vaizdą.";
          setMessages((prev) => {
            const usersOnly = prev.filter((m) => m.role === "user");
            return [
              ...usersOnly,
              { role: "assistant" as const, text: viewReply },
            ].slice(-6);
          });
          return { ok: true, reply: "Vaizdas perjungtas." };
        }
      }

      if (!options?.skipBusyCheck && !busyGate.tryAcquire()) {
        return await new Promise<WakeWordAgentResult>((resolve) => {
          const status = busyGate.enqueue(
            trimmed,
            { ...options, skipUserBubble: true },
            resolve
          );
          if (status === "full") {
            resolve({ ok: false, error: AGENT_QUEUE_FULL_MESSAGE });
          }
        });
      }

      let retainPendingImageUrls = false;

      try {
        setStreamThinkingLabel("Galvoju…");
        const browseAllTurn = resolveBrowseAllIntent(trimmed);
        if (browseAllTurn) {
          dispatchBrowseAllMarketplaceState();
        }
        const catalogCount = listings.filter(
          (l) => !l.banned && l.price > 0 && l.status !== "sold"
        ).length;
        const pageUrl =
          typeof window !== "undefined"
            ? resolveClientPageUrl(
                window.location.pathname,
                window.location.search
              )
            : resolveClientPageUrl(pathname ?? "/");
        const effectiveFilters = searchSessionReset
          ? resetFilters
          : memoryContext.activeSearchFilters;
        const currentUser = buildSupervisorCurrentUser({
          user: profileUser,
          isAuthenticated,
          accountType: resolveAccountTypeLabel(profileUser),
          userRole: resolveAgentUserRole(profileUser),
        });
        const profileContact = buildProfileListingContact(profileUser);
        const supervisorState = buildSupervisorApplicationState({
          pageUrl,
          searchQuery: browseAllTurn ? "" : searchQuery,
          activeSearchFilters: effectiveFilters,
          totalListingsCount: browseAllTurn ? catalogCount : rankedListings.length,
          pendingImageCount: pendingImageCount || undefined,
          currentUser,
        });
        const listingEditSession = readListingEditSession();
        // Final canvas shrink — even if callers pass raw session data URLs.
        const wireVisionUrls = requestPendingImageUrls?.length
          ? capImageUrlsForAgentWire(
              await Promise.all(
                requestPendingImageUrls.map((url) =>
                  url.startsWith("data:image")
                    ? compressForAgentVisionWire(url)
                    : Promise.resolve(url)
                )
              )
            )
          : undefined;
        const agentBody = {
          messages: sessionMessages.map((m) => ({
            role: m.role,
            text:
              m.text?.trim() ||
              (m.imageUrls?.length ? "[Nuotraukos įkeltos]" : m.text ?? ""),
          })),
          context: {
            ...memoryContext,
            ...sellerWizardContext,
            activeSearchFilters: searchSessionReset
              ? resetFilters
              : memoryContext.activeSearchFilters,
            searchSessionReset,
            supervisorState,
            listingEditSession: listingEditSession ?? undefined,
            wizardMode: listingEditSession ? ("listing_edit" as const) : sellerWizardContext.wizardMode,
            monetization: resolveClientMonetizationState(user, activeBoost),
            userRole: resolveAgentUserRole(user),
            contact: profileContact.contact || undefined,
            profilePhone: profileUser.phone?.trim() || undefined,
            profileEmail: profileUser.email?.trim() || undefined,
            profileContactsVerified: hasProfileListingContact(profileUser),
            listings: compactListingsForAgent(listings),
            userName: user.name,
            accountType: resolveAccountTypeLabel(user),
            myListings: myListingsForAgent,
            myListingsSummary: summarizeMyListingsSummary(myListingsForAgent, user.name),
            currentPageContext,
            sessionExpired: sessionExpired || undefined,
            sessionLastActiveAt: lastActiveAt ?? undefined,
            lastSessionTopic,
            pendingImageUrls: wireVisionUrls,
            pendingImageCount: pendingImageCount || undefined,
            geoCityHint,
            lastError,
            isAuthenticated,
            searchResultCount: browseAllTurn
              ? catalogCount
              : options?.proactiveOffer?.kind === "no_match"
                ? 0
                : options?.proactiveOffer?.kind === "search_refine"
                  ? options.proactiveOffer.resultCount ?? rankedListings.length
                  : searchQuery.trim()
                    ? rankedListings.length
                    : undefined,
            lastSearchQuery: browseAllTurn
              ? undefined
              : searchQuery.trim() || undefined,
            currentView: zeroUiScreen,
            fromVoice: voiceReply,
            fromSearchBar: options?.fromSearchBar,
            behaviorHistory: getBehaviorSnapshot(),
            proactiveOffer: options?.proactiveOffer,
            sellerMetrics: {
              views: sellerAnalytics.views,
              callClicks: sellerAnalytics.callClicks,
              chatStarts: sellerAnalytics.chatStarts,
              saves: sellerAnalytics.saves,
              interestScore: sellerAnalytics.interestScore,
              buyerIntentCount,
            },
          },
          ...(includeAdminContext ? { includeAdminContext: true } : {}),
        };

        const res = await apiVautoAgentStream(agentBody, {
          onEvent: (event) => {
            if (event.type === "status") setStreamThinkingLabel(event.message);
            if (event.type === "tool_call") setStreamThinkingLabel(event.message);
          },
        });

        setStreamThinkingLabel("Galvoju…");

        if (!res.ok) {
          const message = buddyMessageForAgentFailure(res.error, res.code);
          setMessages((prev) => {
            const usersOnly = prev.filter((m) => m.role === "user");
            return [
              ...usersOnly,
              { role: "assistant" as const, text: message },
            ].slice(-6);
          });
          speakReply(message);
          if (open && !options?.fromSearchBar) showToast(message, "info");
          return { ok: true, reply: message };
        }

        if (
          isPhotoIntentRoutingReply(res.reply, res.quickReplies) &&
          activePendingImageUrls?.length
        ) {
          retainPendingImageUrls = true;
          await ensurePendingPhotoIntent({
            photos: activePendingImageUrls,
            userCity: user.city,
            userName: user.name,
            wardrobeOnly: pathname === "/fashion" || pathname === "/fashion/",
          });
        } else if (
          activePendingImageUrls?.length &&
          (res.actions.type === "listing_draft" ||
            isPhotoIntentSearchChip(trimmed) ||
            isPhotoIntentListingChip(trimmed))
        ) {
          setSessionPendingImageUrls([]);
        }

        const hasExecutableAction = res.actions.type !== "none";
        const browseAllOutcome =
          res.actions.type === "browse_all" ||
          (res.actions.type === "empty_search" &&
            resolveBrowseAllIntent(trimmed, res.actions.searchQuery));

        const appendSupervisorAssistant = (
          assistantText: string,
          quickReplies?: string[],
          prePublishCard?: import("@/lib/pre-publish-validation").PrePublishCardPayload
        ) => {
          const text = assistantText.trim();
          if (!text) return;
          if (
            text.startsWith("Šiuo metu") ||
            text.startsWith("Deja, pagal") ||
            text.startsWith("Atsiprašau")
          ) {
            return;
          }
          const structuredReplies = quickReplies?.filter(Boolean).slice(0, 4);
          setMessages((prev) => {
            const usersOnly = prev.filter((m) => m.role === "user");
            return [
              ...usersOnly,
              {
                role: "assistant" as const,
                text,
                ...(structuredReplies && structuredReplies.length >= 2
                  ? { quickReplies: structuredReplies }
                  : {}),
                ...(prePublishCard ? { prePublishCard } : {}),
              },
            ].slice(-6);
          });
          if (prePublishCard) {
            setHidePrePublishCard(false);
            setListingPublishConfirmed(true);
          }
        };

        const browseAllBlocked =
          sellerStep === "confirmation" ||
          sellerStep === "published" ||
          isPublishingListing ||
          isListingConfirmationPhrase(trimmed);

        if (browseAllOutcome && res.actions.type === "empty_search" && !browseAllBlocked) {
          const coerced = createBrowseAllAction(catalogCount);
          if (!options?.fromSearchBar) {
            applyActions(coerced);
          }
          const browseReply =
            sanitizeAgentReplyForDisplay(res.reply) || coerced.replyMessage;
          appendSupervisorAssistant(browseReply);
          speakReply(browseReply);
          return {
            ok: true,
            reply: browseReply,
            actions: coerced,
          };
        }

        if (!res.reply && !hasExecutableAction) {
          const fallback = BUDDY_REPEAT_PROMPT;
          appendSupervisorAssistant(fallback);
          speakReply(fallback);
          if (open && !options?.fromSearchBar) showToast(fallback, "info");
          return { ok: true, reply: fallback, actions: res.actions };
        }

        setLastError(undefined);
        let assistantText = resolveAgentChatReply({
          serverReply: res.reply,
          actions: res.actions,
          userQuery: trimmed,
          catalogCount,
          toolCalls: res.toolCalls,
        });

        // FOOLPROOF: whenever AI updates the listing description, force it into chat.
        if (res.actions.type === "listing_draft") {
          const rawDesc = String(res.actions.listingDraft?.description ?? "").trim();
          const desc =
            rawDesc ||
            (aiDraft
              ? resolvePublishListingDescription({
                  ...aiDraft,
                  ...mapAgentDraftToListing(res.actions.listingDraft),
                }).trim()
              : "");
          const forced = formatListingDescriptionChatMessage(desc);
          if (forced) {
            assistantText =
              !assistantText.trim() || isDescriptionGateOnlyReply(assistantText)
                ? forced
                : `${forced}\n\n${assistantText.trim()}`;
          }
        } else if (
          isDescriptionGateOnlyReply(assistantText) &&
          (draftForTurn?.description || aiDraft?.description)
        ) {
          // Server/UI sent only the photos gate — never hide an existing draft description.
          const desc = resolvePublishListingDescription(
            draftForTurn ?? aiDraft!
          ).trim();
          const forced = formatListingDescriptionChatMessage(desc);
          if (forced) assistantText = forced;
        }

        let aiTwinNudge: string | null = null;
        if (
          typeof window !== "undefined" &&
          isAuthenticated &&
          myListingsForAgent.length > 0 &&
          !options?.fromSearchBar
        ) {
          const hasInactiveTwin = listings.some(
            (l) => l.sellerId === user.id && l.status !== "sold" && !l.isAiTwinActive
          );
          const alreadyNudged = Boolean(window.sessionStorage.getItem(AI_TWIN_NUDGE_KEY));
          if (!alreadyNudged && hasInactiveTwin && messages.filter((m) => m.role === "user").length <= 1) {
            window.sessionStorage.setItem(AI_TWIN_NUDGE_KEY, String(Date.now()));
            const firstName = user.name?.trim().split(/\s+/)[0] || "drauge";
            const voc = toLithuanianVocative(firstName);
            aiTwinNudge = `Labas, ${voc}! Pastebėjau, kad jūsų skelbimai sulauktų daugiau pardavimų su aktyvuotu AI Derybininku. Nurodykite minimalią kainą pokalbyje ir aš paleisiu jūsų dvynį į darbą!`;
          }
        }

        const baseAssistantText = proactiveContactConfirmation
          ? assistantText.trim()
            ? `${proactiveContactConfirmation}\n\n${assistantText.trim()}`
            : proactiveContactConfirmation
          : assistantText;

        const mergedAssistantText = aiTwinNudge
          ? baseAssistantText.trim()
            ? `${aiTwinNudge}\n\n${baseAssistantText.trim()}`
            : aiTwinNudge
          : baseAssistantText;

        if (mergedAssistantText.trim()) {
          if (
            proactiveContactConfirmation ||
            (!mergedAssistantText.startsWith("Šiuo metu") &&
              !mergedAssistantText.startsWith("Deja, pagal") &&
              !mergedAssistantText.startsWith("Atsiprašau"))
          ) {
            appendSupervisorAssistant(
              mergedAssistantText,
              res.quickReplies,
              res.prePublishCard
            );
          }
        }
        speakReply(mergedAssistantText || assistantText);
        if (hasExecutableAction) {
          setSearchQuery("");
          if (
            res.actions.type === "listing_draft" &&
            resolveBrowseAllIntent(trimmed) &&
            !isListingConfirmationPhrase(trimmed)
          ) {
            const activeCount = listings.filter(
              (l) => !l.banned && l.price > 0 && l.status !== "sold"
            ).length;
            const browseActions = createBrowseAllAction(activeCount);
            if (!options?.fromSearchBar) {
              applyActions(browseActions);
            }
            return {
              ok: true,
              reply: browseActions.replyMessage,
              actions: browseActions,
            };
          }
          if (!options?.fromSearchBar) {
            applyActions(res.actions);
          }
          if (voiceReply) {
            void teardownVoiceAfterUiAction(res.actions);
          }
        }
        if (res.actions.type !== "micro_payment") {
          const paymentIntent = microPaymentFromToolResult(
            res.toolCalls.find((t) => t.name === "triggerMicroPayment")?.result
          );
          if (paymentIntent) {
            openMicroPayment(paymentIntent);
          }
        }
        return { ok: true, reply: res.reply || assistantText, actions: res.actions };
      } catch {
        const message = BUDDY_REPEAT_PROMPT;
        setMessages((prev) => {
          const usersOnly = prev.filter((m) => m.role === "user");
          return [
            ...usersOnly,
            { role: "assistant" as const, text: message },
          ].slice(-6);
        });
        speakReply(message);
        if (open) showToast(message, "info");
        return { ok: true, reply: message };
      } finally {
        setStreamThinkingLabel("");
        if (incomingImages?.length && !retainPendingImageUrls) {
          setSessionPendingImageUrls([]);
        }
        touchAgentSessionActivity();
        busyGate.release(options?.skipBusyCheck);
        drainAgentQueue();
      }
    },
    [
      applyActions,
      dispatchBrowseAllMarketplaceState,
      busyGate,
      lastError,
      listings,
      messages,
      showToast,
      setViewMode,
      user,
      isAuthenticated,
      updateUser,
      rankedListings,
      searchQuery,
      pathname,
      includeAdminContext,
      buildAgentContext,
      noteUserMessage,
      zeroUiScreen,
      open,
      activeSearchFilters,
      clearSearchFilters,
      activeBoost,
      openMicroPayment,
      pendingWardrobeBulkItems,
      pendingWardrobeVoice,
      publishBulkClothingListings,
      publishListing,
      applyAgentWardrobeBulk,
      applyAgentListingDraft,
      navigateToAdd,
      openAuthModal,
      broadenSearch,
      registerWantedFlow,
      lastBargainingOffer,
      openBargainingChat,
      searchSimilarListings,
      revertPhotoCategoryMismatch,
      acceptPhotoCategoryMismatch,
      sessionPendingImageUrls,
      setLastBargainingOffer,
      sellerAnalytics,
      buyerIntentCount,
      buyerCoords,
      activateWardrobeSpinta,
      routeZeroUiScreen,
      router,
      myListingsForAgent,
      currentPageContext,
      aiDraft,
      sellerStep,
      sellerPreviewImage,
      isPublishingListing,
      sellerWizardContext,
      trackEvent,
      getBehaviorSnapshot,
      teardownVoiceAfterUiAction,
      updateAiDraft,
      sellerVisionRecoveryActive,
      setOpen,
      setMessages,
      setSearchQuery,
      commitVisionObjectSellToPrePublish,
    ]
  );

  useEffect(() => {
    sendAgentMessageRef.current = sendAgentMessage;
  }, [sendAgentMessage]);

  useEffect(() => {
    registerConductorSearchExecutor(async (query) => {
      if (resolveBrowseAllIntent(query)) {
        const activeCount = listings.filter(
          (l) => !l.banned && l.price > 0 && l.status !== "sold"
        ).length;
        const actions = createBrowseAllAction(activeCount);
        return {
          ok: true,
          reply: actions.replyMessage,
          actions,
        };
      }
      return sendAgentMessageRef.current(query, {
        fromSearchBar: true,
        skipBusyCheck: true,
      });
    });
    return () => registerConductorSearchExecutor(null);
  }, [listings]);

  const reportAgentError = useCallback((code: string, message?: string) => {
    setLastError({ code, message });
    if (code === "ai_timeout" || code === "ai_invalid") return;
    if (!open) return;
    void sendAgentMessage(
      `Sistema praneša apie klaidą: ${code}. ${message ?? ""}`
    ).catch(() => {
      /* avoid duplicate error toast when agent itself is unavailable */
    });
  }, [open, sendAgentMessage]);

  useEffect(() => {
    registerAgentErrorReporter(reportAgentError);
    return () => registerAgentErrorReporter(null);
  }, [reportAgentError]);

  const openWithGreeting = useCallback(
    (text: string, options?: AgentGreetingOptions) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (options?.openSheet) setOpen(true);
      setSearchInputMode("text");
      setSearchVoiceMode(false);
      const isolated = Boolean(options?.isolatedMismatch || options?.replaceThread);
      const quickReplies = options?.isolatedMismatch
        ? options.quickReplies?.filter(Boolean).slice(0, 2)
        : options?.quickReplies?.filter(Boolean).slice(0, 4);
      const assistantMsg = {
        role: "assistant" as const,
        text: trimmed,
        ...(quickReplies?.length ? { quickReplies } : {}),
      };
      setMessages((prev) => {
        if (isolated) return [assistantMsg];
        const usersOnly = prev.filter((m) => m.role === "user");
        return [...usersOnly, assistantMsg].slice(-6);
      });
    },
    [setSearchInputMode, setSearchVoiceMode, setOpen]
  );

  useEffect(() => {
    registerAgentGreetingHost(openWithGreeting);
    registerAgentFlowHost(({ message, quickReplies, openSheet }) => {
      openWithGreeting(message, { quickReplies, openSheet });
    });
    registerAgentPendingImagesHost((urls) => {
      setSessionPendingImageUrls(urls);
    });
    return () => {
      registerAgentGreetingHost(null);
      registerAgentFlowHost(null);
      registerAgentPendingImagesHost(null);
    };
  }, [openWithGreeting]);

  useEffect(() => {
    if (!sessionPendingImageUrls.length) return;
    if (!aiDraft) return;
    if (sellerStep === "idle") return;

    const first = sessionPendingImageUrls.find((u) => typeof u === "string" && u.trim());
    if (!first) return;
    if (!first.startsWith("data:image")) return;
    if (backgroundScanSeenRef.current.has(first)) return;
    backgroundScanSeenRef.current.add(first);

    let cancelled = false;
    (async () => {
      try {
        const { apiScanBarcodeImage, apiScanVinImage, apiLookupVehicle } = await import(
          "@/lib/api/client"
        );

        if (aiDraft.category === "vehicles") {
          const vin = await apiScanVinImage(first);
          if (!cancelled && vin) {
            const vehicle = await apiLookupVehicle(vin, { vin });
            if (!cancelled && vehicle) {
              const { vehicleLookupToDraftPatch } = await import(
                "@/lib/vehicle-intelligence/vehicle-lookup"
              );
              const patch = vehicleLookupToDraftPatch(vehicle);
              updateAiDraft({
                ...aiDraft,
                title: patch.title ?? aiDraft.title,
                description: patch.description ?? aiDraft.description,
                confidence: Math.max(aiDraft.confidence ?? 0, patch.confidence ?? 0),
                attributes: {
                  ...(aiDraft.attributes ?? {}),
                  ...(patch.attributes ?? {}),
                },
              });
              openWithGreeting(
                "Nuskanavau jūsų įkeltą kodą ir automatiškai papildžiau techninius duomenis!",
                { openSheet: true }
              );
            }
          }
        }

        const barcode = await apiScanBarcodeImage(first);
        if (!cancelled && barcode) {
          const { isBarcodeLookupEligibleCategory } = await import(
            "@/lib/product-intelligence/barcode-utils"
          );
          if (isBarcodeLookupEligibleCategory(aiDraft.category)) {
            const { apiLookupBarcode } = await import("@/lib/api/client");
            const lookup = await apiLookupBarcode(barcode);
            if (cancelled || !lookup) return;
            const { barcodeLookupToDraftPatch } = await import(
              "@/lib/product-intelligence/barcode-lookup"
            );
            const patch = barcodeLookupToDraftPatch(lookup, {
              title: aiDraft.title,
              description: aiDraft.description,
              attributes: aiDraft.attributes ?? {},
            });
            updateAiDraft({
              ...aiDraft,
              title: patch.title ?? aiDraft.title,
              description: patch.description ?? aiDraft.description,
              confidence: Math.max(aiDraft.confidence ?? 0, patch.confidence ?? 0),
              attributes: {
                ...(aiDraft.attributes ?? {}),
                barcode,
                ...(patch.attributes ?? {}),
              },
            });
            openWithGreeting(
              "Nuskanavau jūsų įkeltą kodą ir automatiškai papildžiau techninius duomenis!",
              { openSheet: true }
            );
          }
        }
      } catch {
        // Passive assistant: background scan must never break chat UX.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionPendingImageUrls, aiDraft, sellerStep, updateAiDraft, openWithGreeting]);

  const listingEditBootstrappedRef = useRef<number | null>(null);
  useEffect(() => {
    const bootstrapEditSession = (session: ListingEditSession) => {
      if (!isListingEditHostPath(pathname ?? "/")) return;
      if (listingEditBootstrappedRef.current === session.startedAt) return;
      listingEditBootstrappedRef.current = session.startedAt;
      openWithGreeting(buildListingEditOpener(session.title), {
        replaceThread: true,
        openSheet: true,
      });
    };

    const onEditSession = (event: Event) => {
      const session = (event as CustomEvent<ListingEditSession>).detail;
      if (session?.listingId) bootstrapEditSession(session);
    };

    window.addEventListener(LISTING_EDIT_SESSION_EVENT, onEditSession);
    const existing = readListingEditSession();
    if (existing) bootstrapEditSession(existing);

    return () => {
      window.removeEventListener(LISTING_EDIT_SESSION_EVENT, onEditSession);
    };
  }, [pathname, openWithGreeting]);

  const clearAgentChatSession = useCallback(() => {
    setMessages([]);
    setSessionPendingImageUrls([]);
    setLastBargainingOffer(null);
    setLastError(undefined);
    setOpen(false);
    setBusy(false);
    setStreamThinkingLabel("Galvoju…");
  }, []);

  const enterListingEditMode = useCallback(() => {
    setHidePrePublishCard(true);
    setListingPublishConfirmed(false);
    setAwaitingListingEditField(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant" as const,
        text: LISTING_EDIT_INTRO,
        quickReplies: buildListingEditQuickReplies(),
      },
    ].slice(-6));
    touchAgentSessionActivity();
  }, []);

  const handleDirectAgentChip = useCallback(
    async (chip: string): Promise<boolean> => {
      const trimmed = chip.trim();
      if (!trimmed) return false;

      // „Parduoti mobilųjį telefoną“ etc. — hard local PrePublish, never server.
      if (isVisionObjectSellChip(trimmed)) {
        commitVisionObjectSellToPrePublish(trimmed);
        return true;
      }

      // Publish-gate chips — route through SM (no free-text LLM loop).
      if (
        aiDraft &&
        (/^viskas\b/i.test(trimmed) ||
          /\bpublikuojam\b/i.test(trimmed) ||
          /\bprepublish\b/i.test(trimmed) ||
          /\bjudame\s+prie\b/i.test(trimmed) ||
          /^nenoriu\b/i.test(trimmed) ||
          /^prisegti\s+nuotrauk/i.test(trimmed) ||
          /^įkelti\s+dar\s+nuotrauk/i.test(trimmed))
      ) {
        const result = await sendAgentMessageRef.current(trimmed);
        return result.ok;
      }

      if (isPhotoIntentSearchChip(trimmed) || isPhotoIntentListingChip(trimmed)) {
        const wardrobeOnly = pathname === "/fashion" || pathname === "/fashion/";
        return executeDirectPhotoIntentChip(trimmed, {
          wardrobeOnly,
          getFallbackPhotos: () => sessionPendingImageUrls,
          bootstrapIntent: async (photos) => {
            const session = await ensurePendingPhotoIntent({
              photos,
              userCity: user.city,
              userName: user.name,
              wardrobeOnly,
            });
            return Boolean(session);
          },
          search: {
            listings,
            marketplaceFilters,
            userName: user.name,
            userCity: user.city,
            userPhone: user.phone,
            wardrobeOnly,
            applyVisualSearch,
            syncAgentAction: applyActions,
            setSearchInputMode,
            setSearchQuery,
            scrollToResults: () => {
              document
                .getElementById("listing-results")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
            notifyPhotoSearch: (label, count) => {
              notifyAgentFlow({
                kind: "photo_search_applied",
                objectLabel: label,
                resultCount: count,
              });
            },
            sendAgentMessage: (text, opts) =>
              sendAgentMessageRef.current(text, {
                fromSearchBar: true,
                pendingImageUrls: opts?.pendingImageUrls,
              }),
            openWithGreeting: (text, opts) => {
              setOpen(true);
              const quickReplies = opts?.quickReplies?.filter(Boolean).slice(0, 4);
              setMessages((prev) =>
                [
                  ...prev,
                  {
                    role: "assistant" as const,
                    text,
                    ...(quickReplies?.length ? { quickReplies } : {}),
                  },
                ].slice(-6)
              );
            },
            showToast,
          },
          listing: { submitSellerContent, showToast },
          onAssistantReply: (reply) => {
            setOpen(true);
            setSessionPendingImageUrls([]);
            if (isPhotoIntentSearchChip(trimmed)) goToMarketplace("agent");
            setMessages((prev) => [...prev, { role: "assistant" as const, text: reply }].slice(-6));
            touchAgentSessionActivity();
          },
          onError: (message) => showToast(message, "error"),
        });
      }

      if (isGapActionChip(trimmed) && !/^įkelti nuotrauk/i.test(trimmed)) {
        const field = gapFieldFromChip(trimmed);
        if (field === "phone" || field === "city") {
          const profileHad =
            field === "phone"
              ? hasProfileListingContact(user)
              : Boolean(user.city?.trim());
          if (profileHad) {
            logHeroContactReask(field, "gap_chip_while_profile_ready");
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant" as const,
              text:
                field === "phone"
                  ? "Telefonas imamas iš profilio. Atidarau nustatymus — įrašykite numerį, tada grįšime prie skelbimo."
                  : "Miestas imamas iš profilio. Atidarau nustatymus — įrašykite miestą, tada grįšime prie skelbimo.",
            },
          ].slice(-6));
          router.push(
            field === "phone"
              ? "/profile/settings/?focus=phone"
              : "/profile/settings/?focus=city"
          );
          return true;
        }
      }

      if (/^įkelti nuotrauk/i.test(trimmed) || isGapActionChip(trimmed)) {
        if (isGapActionChip(trimmed) && !/^įkelti nuotrauk/i.test(trimmed)) {
          return false;
        }
        const dataUrl = await pickListingPhotoDirect("gallery");
        if (dataUrl) {
          updateSellerMedia({ imageDataUrl: dataUrl });
          if (aiDraft) {
            updateAiDraft({
              orderedImageUrls: [dataUrl, ...(aiDraft.orderedImageUrls ?? [])].slice(0, 6),
            });
          }
          showToast("Nuotrauka pridėta.", "success");
        }
        return true;
      }

      if (isEditActionChip(trimmed)) {
        const field = editFieldFromChip(trimmed);
        if (field) {
          setAwaitingListingEditField(field);
          setHidePrePublishCard(true);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant" as const,
              text: buildListingEditPrompt(field),
              quickReplies: buildListingEditQuickReplies(),
            },
          ].slice(-6));
          touchAgentSessionActivity();
          return true;
        }
        if (/redaguoti duomenis/i.test(trimmed)) {
          enterListingEditMode();
          return true;
        }
      }

      return false;
    },
    [
      pathname,
      router,
      listings,
      marketplaceFilters,
      user,
      applyVisualSearch,
      applyActions,
      setSearchInputMode,
      setSearchQuery,
      showToast,
      submitSellerContent,
      goToMarketplace,
      updateSellerMedia,
      aiDraft,
      updateAiDraft,
      enterListingEditMode,
      sessionPendingImageUrls,
      commitVisionObjectSellToPrePublish,
    ]
  );

  useEffect(() => {
    handleDirectAgentChipRef.current = handleDirectAgentChip;
  }, [handleDirectAgentChip]);

  const resetHomeAgentSession = useCallback(() => {
    cancelSellerFlow();
    setHidePrePublishCard(false);
    setListingPublishConfirmed(false);
    setAwaitingListingEditField(null);
    applyBrowseAllMarketplaceState({
      setSearchQuery,
      setAgentPinnedListings,
      clearSearchFilters,
      resetMarketplaceFilters,
      clearVisualSearch,
      setSearchInputMode,
      setSearchVoiceMode,
      setViewMode,
    });
    setSearchLoading(false);
    clearPhotoSearchSession();
    goToMarketplace("user");
    clearAgentChatSession();
    dispatchHomeReset();
    if (
      pathname?.startsWith("/add") ||
      pathname?.startsWith("/fashion/mine")
    ) {
      router.push("/");
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [
    cancelSellerFlow,
    setSearchQuery,
    setAgentPinnedListings,
    clearSearchFilters,
    resetMarketplaceFilters,
    clearVisualSearch,
    setSearchInputMode,
    setSearchVoiceMode,
    setViewMode,
    setSearchLoading,
    goToMarketplace,
    clearAgentChatSession,
    pathname,
    router,
  ]);

  useEffect(() => {
    return subscribeHomeReset(clearAgentChatSession);
  }, [clearAgentChatSession]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      openWithGreeting,
      messages,
      busy,
      isAgentThinking: busy,
      streamThinkingLabel,
      sendAgentMessage,
      handleDirectAgentChip,
      enterListingEditMode,
      hidePrePublishCard,
      listingPublishConfirmed,
      sessionPendingImageUrls,
      resetPublishSession,
      applyAgentActions: applyActions,
      reportAgentError,
      resetHomeAgentSession,
    }),
    [
      open,
      openWithGreeting,
      messages,
      busy,
      streamThinkingLabel,
      sendAgentMessage,
      handleDirectAgentChip,
      enterListingEditMode,
      hidePrePublishCard,
      listingPublishConfirmed,
      sessionPendingImageUrls,
      resetPublishSession,
      applyActions,
      reportAgentError,
      resetHomeAgentSession,
    ]
  );

  return (
    <VautoAgentContext.Provider value={value}>
      {children}
    </VautoAgentContext.Provider>
  );
}

export function useVautoAgent(): VautoAgentContextValue {
  const ctx = useContext(VautoAgentContext);
  if (!ctx) throw new Error("useVautoAgent must be used within VautoAgentProvider");
  return ctx;
}

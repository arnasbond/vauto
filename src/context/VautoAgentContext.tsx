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
import { apiVautoAgent, SESSION_EXPIRED_MESSAGE } from "@/lib/api/client";
import { apiVautoAgentStream } from "@/lib/api/vauto-agent-stream";
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
  AGENT_BUSY_MESSAGE,
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
  clearPendingPhotoIntent,
  peekPendingPhotoIntent,
} from "@/lib/photo-intent-session";
import {
  executePhotoIntentListing,
  executePhotoIntentSearch,
} from "@/lib/photo-intent-actions";
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
  readListingEditSession,
} from "@/lib/listing-edit-session";
import {
  buildManualFillChatRedirectReply,
  isListingConversationInput,
  isManualFillIntent,
  tryApplyListingChatInput,
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
  buildPrePublishMissingGuide,
  evaluatePrePublishReadiness,
  PRE_PUBLISH_BLOCKED_QUICK_REPLIES,
  PRE_PUBLISH_READY_INTRO,
} from "@/lib/pre-publish-validation";
import { usePublishCelebration } from "@/context/PublishCelebrationContext";
import {
  centerScreenPublishRect,
  runPublishSuccessCelebration,
} from "@/lib/publish-success-celebration";

const AI_TWIN_NUDGE_KEY = "vauto_ai_twin_nudge_v1";

export interface AgentSendOptions {
  skipBusyCheck?: boolean;
  pendingImageUrls?: string[];
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
    sellerVisionRecoveryActive,
    cancelSellerFlow,
    sellerPreviewImage,
    finishPublishedFlow,
  } = useSellerFlow();
  const { playPublishCelebration } = usePublishCelebration();
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
        const draft = mapAgentDraftToListing(actions.listingDraft);
        applyAgentListingDraft(draft, actions.imageUrl);
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

  const sendAgentMessage = useCallback(
    async (
      text: string,
      options?: AgentSendOptions
    ): Promise<WakeWordAgentResult> => {
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "Tuščia užklausa" };

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
          return {
            reply: readiness.blockMessage,
            quickReplies: readiness.quickReplies,
          };
        }
        const card = buildPrePublishCardPayload(readiness, sellerPreviewImage);
        if (card && (readiness.syncedDraft?.price ?? 0) > 0) {
          return {
            reply: PRE_PUBLISH_READY_INTRO,
            prePublishCard: card,
          };
        }
        return {
          reply:
            "Skelbimo juodraštis paruoštas! Norite, kad jūsų skelbimas parduotų greičiau? Galiu jį iškelti į viršų, paryškinti arba Aktyvuoti jūsų AI Dvynį-Derybininką. Ar pritaikom premium funkciją?",
          quickReplies: [
            "Iškelti į viršų",
            "Paryškinti",
            "Aktyvuoti AI derybininką",
            "Ne, be reklamos",
          ],
        };
      };

      const confirmPublishNow = (): {
        reply: string;
        quickReplies?: string[];
        publishAfterReply?: boolean;
        prePublishCard?: import("@/lib/pre-publish-validation").PrePublishCardPayload;
      } => {
        const readiness = runPrePublishGate();
        if (!readiness.ok) {
          return {
            reply: readiness.blockMessage,
            quickReplies: readiness.quickReplies,
          };
        }
        const card = buildPrePublishCardPayload(readiness, sellerPreviewImage);
        if (card && (readiness.syncedDraft?.price ?? 0) > 0) {
          return {
            reply: PRE_PUBLISH_READY_INTRO,
            prePublishCard: card,
          };
        }
        return { reply: "Publikuoju skelbimą…", publishAfterReply: true };
      };

      const buildPrePublishMissingGuideReply = (): string => {
        const readiness = runPrePublishGate();
        return `${readiness.blockMessage}\n\n${buildPrePublishMissingGuide(readiness)}`;
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

      const listingChatReply =
        aiDraft && isListingConversationInput(trimmed, listingChatContext)
          ? tryApplyListingChatInput(trimmed, aiDraft, updateAiDraft)
          : null;
      if (listingChatReply) {
        setMessages((prev) => [
          ...prev,
          { role: "user" as const, text: trimmed },
          { role: "assistant" as const, text: listingChatReply },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply: listingChatReply };
      }

      if (isTooShortAgentQuery(trimmed, { fromVoice: voiceReply, listingChat: listingChatContext })) {
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

      if (isPhotoIntentSearchChip(trimmed) || isPhotoIntentListingChip(trimmed)) {
        const pending = peekPendingPhotoIntent();
        if (pending) {
          const wardrobeOnly =
            pathname === "/fashion" || pathname === "/fashion/";
          let reply: string;
          try {
            if (isPhotoIntentSearchChip(trimmed)) {
              reply = await executePhotoIntentSearch(pending, {
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
                  sendAgentMessage(text, {
                    fromSearchBar: true,
                    pendingImageUrls: opts?.pendingImageUrls,
                  }),
                openWithGreeting: (text, opts) => {
                  setOpen(true);
                  const quickReplies = opts?.quickReplies?.filter(Boolean).slice(0, 4);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "assistant" as const,
                      text,
                      ...(quickReplies?.length ? { quickReplies } : {}),
                    },
                  ].slice(-6));
                },
                showToast,
              });
              goToMarketplace("agent");
            } else {
              reply = await executePhotoIntentListing(pending, {
                submitSellerContent,
                showToast,
              });
            }
            clearPendingPhotoIntent();
          } catch {
            showToast("Nepavyko apdoroti nuotraukos — bandykite dar kartą.", "error");
            reply = "Įvyko klaida — pasirinkite veiksmą dar kartą arba įkelkite nuotrauką iš naujo.";
          }
          setOpen(true);
          setMessages((prev) => [
            ...prev,
            { role: "user", text: trimmed },
            { role: "assistant", text: reply },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply };
        }
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
            ...(r.publishAfterReply ? { publishAfterReply: true } : {}),
          };
        },
        buildPrePublishMissingGuide: buildPrePublishMissingGuideReply,
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
        setMessages((prev) => [
          ...prev,
          { role: "user", text: trimmed },
          {
            role: "assistant",
            text: quickReply.reply,
            ...(quickReply.quickReplies?.length ? { quickReplies: quickReply.quickReplies } : {}),
            ...(quickReply.prePublishCard ? { prePublishCard: quickReply.prePublishCard } : {}),
          },
        ]);
        let finalReply = quickReply.reply;
        if (quickReply.publishAfterReply) {
          const result = await publishListing();
          if (result.ok) {
            await runPublishSuccessCelebration({
              result,
              sourceRect: centerScreenPublishRect(),
              playCelebration: playPublishCelebration,
              finishPublishedFlow,
              router,
            });
            finalReply = "Skelbimas sėkmingai įkeltas! Perkeliame į Mano skelbimai…";
          } else if (result.sessionExpired) {
            finalReply = result.error ?? SESSION_EXPIRED_MESSAGE;
          } else if (result.prePublishBlocked) {
            finalReply = result.error ?? "Trūksta duomenų publikavimui.";
          } else {
            finalReply = `Nepavyko išsaugoti skelbimo: ${result.error ?? "Nežinoma klaida"}`;
          }
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              text: finalReply,
              ...(!result.ok
                ? {
                    quickReplies: result.sessionExpired
                      ? ["Prisijungti iš naujo"]
                      : result.prePublishBlocked
                        ? [...PRE_PUBLISH_BLOCKED_QUICK_REPLIES]
                        : ["Reikia pataisyti"],
                  }
                : {}),
            };
            return next.slice(-6);
          });
          if (!result.ok) {
            showToast(finalReply, "error");
          } else {
            speakReply(finalReply);
          }
        }
        touchAgentSessionActivity();
        return { ok: true, reply: finalReply };
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

      const incomingImages = options?.pendingImageUrls?.filter(Boolean).slice(0, 6);
      if (incomingImages?.length) {
        setSessionPendingImageUrls(incomingImages);
      }
      const activePendingImageUrls =
        incomingImages ?? (sessionPendingImageUrls.length ? sessionPendingImageUrls : undefined);

      const userMsg: AgentChatMessage = { role: "user", text: trimmed };
      const proactiveOnly = Boolean(options?.proactiveTriggerOnly);
      const apiUserText = proactiveOnly
        ? `[Proaktyvi intervencija: ${options?.proactiveOffer?.kind ?? "assist"} — ${
            options?.proactiveOffer?.query?.trim() ||
            options?.proactiveOffer?.listingTitle?.trim() ||
            "padėk vartotojui proaktyviai"
          }]`
        : trimmed;

      const nextMessages = proactiveOnly
        ? conversationBase
        : [...conversationBase, userMsg];

      if (!proactiveOnly) {
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
          const contactReply = proactiveContactConfirmation;
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
        return { ok: false, error: AGENT_BUSY_MESSAGE };
      }

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
          pendingImageUrls: activePendingImageUrls,
          currentUser,
        });
        const listingEditSession = readListingEditSession();
        const agentBody = {
          messages: sessionMessages.map((m) => ({ role: m.role, text: m.text })),
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
            pendingImageUrls: activePendingImageUrls,
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

        const res =
          (await apiVautoAgentStream(agentBody, {
            onEvent: (event) => {
              if (event.type === "status") setStreamThinkingLabel(event.message);
              if (event.type === "tool_call") setStreamThinkingLabel(event.message);
            },
          })) ?? (await apiVautoAgent(agentBody));

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

        const hasExecutableAction = res.actions.type !== "none";
        const browseAllOutcome =
          res.actions.type === "browse_all" ||
          (res.actions.type === "empty_search" &&
            resolveBrowseAllIntent(trimmed, res.actions.searchQuery));

        const appendSupervisorAssistant = (
          assistantText: string,
          quickReplies?: string[]
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
              },
            ].slice(-6);
          });
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
        const assistantText = resolveAgentChatReply({
          serverReply: res.reply,
          actions: res.actions,
          userQuery: trimmed,
          catalogCount,
          toolCalls: res.toolCalls,
        });

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
            appendSupervisorAssistant(mergedAssistantText, res.quickReplies);
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
      finishPublishedFlow,
      playPublishCelebration,
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
      marketplaceFilters,
      applyVisualSearch,
      submitSellerContent,
      updateAiDraft,
      sellerVisionRecoveryActive,
      goToMarketplace,
      setOpen,
      setMessages,
      setSearchInputMode,
      setSearchQuery,
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

  const editSessionConsumedRef = useRef(false);
  useEffect(() => {
    if (editSessionConsumedRef.current || pathname !== "/") return;
    const session = readListingEditSession();
    if (!session) return;
    editSessionConsumedRef.current = true;
    openWithGreeting(buildListingEditOpener(session.title), { replaceThread: true });
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

  const resetHomeAgentSession = useCallback(() => {
    cancelSellerFlow();
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

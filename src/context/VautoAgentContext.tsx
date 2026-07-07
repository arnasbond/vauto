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
import { apiVautoAgent } from "@/lib/api/client";
import { apiVautoAgentStream } from "@/lib/api/vauto-agent-stream";
import {
  BUDDY_REPEAT_PROMPT,
  buddyMessageForAgentFailure,
} from "@/lib/voice-graceful";
import { requestWizardAgentExpand } from "@/lib/ai-conversational-recovery";
import {
  buildCurrentPageContext,
  buildPersonalizedAgentGreeting,
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
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import {
  buildBrowseAllReply,
  buildEmptySearchReply,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import { isBrowseAllIntent, resolveBrowseAllIntent, createBrowseAllAction } from "@/lib/browse-all-intent";
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
import { detectSellerListingIntent } from "@/lib/scoring";
import { looksLikeClothingListing } from "@/lib/clothing-catalog";
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
}

const VautoAgentContext = createContext<VautoAgentContextValue | null>(null);

export function VautoAgentProvider({ children }: { children: ReactNode }) {
  const { trackEvent, getBehaviorSnapshot } = useUserBehavior();
  const {
    setSearchQuery,
    setSearchInputMode,
    setSearchVoiceMode,
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
    startListingFromQuery,
    applyVisualSearch,
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
    revertPhotoCategoryMismatch,
    acceptPhotoCategoryMismatch,
    submitSellerContent,
    updateAiDraft,
    sellerVisionRecoveryActive,
    submitSellerClarification,
    cancelSellerFlow,
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

  const agentGreeting = useMemo(
    () => buildPersonalizedAgentGreeting(user.name, myListingsForAgent),
    [user.name, myListingsForAgent]
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
    return {
      wizardMode:
        sellerStep === "idle"
          ? ("idle" as const)
          : ("listing_review" as const),
      listingDraft: {
        title: aiDraft.title,
        description: aiDraft.description,
        price: aiDraft.price,
        location: aiDraft.location,
        category: aiDraft.category,
        attributes: aiDraft.attributes as Record<string, string> | undefined,
      },
    };
  }, [aiDraft, sellerStep]);

  const [open, setOpen] = useState(false);
  const [streamThinkingLabel, setStreamThinkingLabel] = useState("Galvoju…");
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => [
    {
      role: "assistant",
      text: buildPersonalizedAgentGreeting("Svečias", []),
    },
  ]);
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.role !== "assistant") return prev;
      return [{ role: "assistant", text: agentGreeting }];
    });
  }, [agentGreeting]);

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

      try {
      if (actions.type === "search") {
        goToMarketplace("agent");
        setOpen(false);
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        const displayQuery = stripLegacyCategorySuffixes(
          actions.filters?.query?.trim() || actions.searchQuery
        );
        setSearchQuery(displayQuery);
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
          query: displayQuery,
          resultCount: actions.listingIds.length,
        });
        if (actions.listingIds.length) {
          showToast(`Rasta ${actions.listingIds.length} skelbimų`, "success");
        }
        window.setTimeout(() => focusSearchOutcome(actions.listingIds.length), 120);
      }
      if (actions.type === "browse_all") {
        exitListingPipelineForMarketplaceSearch();
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        setSearchVoiceMode(false);
        setSearchQuery("");
        setAgentPinnedListings(null);
        resetMarketplaceFilters();
        clearSearchFilters();
        setViewMode("grid");
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
        const draft = mapAgentDraftToListing(actions.listingDraft);
        applyAgentListingDraft(draft, actions.imageUrl);
        navigateToAdd(draft.category === "clothing");
        setOpen(true);
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
        goToMarketplace("agent");
        setOpen(true);
        requestWizardAgentExpand();
        setAgentPinnedListings([]);
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        const displayQuery = stripLegacyCategorySuffixes(
          actions.filters?.query?.trim() || actions.searchQuery
        );
        setSearchQuery(displayQuery);
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
          query: displayQuery,
          filters: actions.filters ?? null,
        });
        trackEvent("agent_action", { action: "empty_search", query: displayQuery });
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
        const displayQuery =
          actions.query?.trim() ||
          actions.filters?.query?.trim();
        if (displayQuery) {
          setSearchQuery(stripLegacyCategorySuffixes(displayQuery));
        }
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
        if (actions.query?.trim()) {
          setSearchQuery(stripLegacyCategorySuffixes(actions.query.trim()));
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
      resetMarketplaceFilters,
      exitListingPipelineForMarketplaceSearch,
      searchQuery,
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
        if (!options?.fromSearchBar) {
          applyActions(actions);
        }
        touchAgentSessionActivity();
        return { ok: true, reply: actions.replyMessage, actions };
      }

      if (sellerVisionRecoveryActive && !resolveBrowseAllIntent(trimmed)) {
        if (!busyGate.tryAcquire(options?.skipBusyCheck)) {
          return { ok: false, error: AGENT_BUSY_MESSAGE };
        }
        try {
          await submitSellerClarification(trimmed);
          setOpen(true);
          setMessages((prev) => [
            ...prev,
            { role: "user" as const, text: trimmed },
            {
              role: "assistant" as const,
              text: "Analizuoju jūsų aprašymą ir paruošiu skelbimo juodraštį…",
            },
          ].slice(-6));
          touchAgentSessionActivity();
          return {
            ok: true,
            reply: "Analizuoju jūsų aprašymą ir paruošiu skelbimo juodraštį…",
          };
        } finally {
          busyGate.release(options?.skipBusyCheck);
          drainAgentQueue();
        }
      }

      if (isTooShortAgentQuery(trimmed, { fromVoice: voiceReply })) {
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
        searchSimilarListings,
        revertPhotoCategoryMismatch,
        acceptPhotoCategoryMismatch,
      });
      if (quickReply) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: trimmed },
          { role: "assistant", text: quickReply.reply },
        ]);
        touchAgentSessionActivity();
        return { ok: true, reply: quickReply.reply };
      }

      if (
        !options?.fromSearchBar &&
        !resolveBrowseAllIntent(trimmed) &&
        detectSellerListingIntent(trimmed) &&
        sellerStep === "idle"
      ) {
        const fashion = looksLikeClothingListing(trimmed);
        const started = startListingFromQuery(trimmed);
        if (started) {
          const reply = fashion
            ? "Puiku! Atidarau Tavo AI Spintą — užpildykime skelbimo formą kartu."
            : "Gerai, pradedame skelbimą — patikrinkite laukus formoje.";
          setMessages((prev) => [
            ...prev,
            { role: "user", text: trimmed },
            { role: "assistant", text: reply },
          ]);
          touchAgentSessionActivity();
          return { ok: true, reply };
        }
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
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: viewReply,
            },
          ]);
          return { ok: true, reply: "Vaizdas perjungtas." };
        }
      }

      if (!options?.skipBusyCheck && !busyGate.tryAcquire()) {
        return { ok: false, error: AGENT_BUSY_MESSAGE };
      }

      try {
        setStreamThinkingLabel("Galvoju…");
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
        const supervisorState = buildSupervisorApplicationState({
          pageUrl,
          searchQuery,
          activeSearchFilters: effectiveFilters,
          totalListingsCount: rankedListings.length,
          pendingImageUrls: activePendingImageUrls,
        });
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
            monetization: resolveClientMonetizationState(user, activeBoost),
            userRole: resolveAgentUserRole(user),
            contact: user.phone || "+370 612 34567",
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
            searchResultCount:
              options?.proactiveOffer?.kind === "no_match"
                ? 0
                : options?.proactiveOffer?.kind === "search_refine"
                  ? options.proactiveOffer.resultCount ?? rankedListings.length
                  : searchQuery.trim()
                    ? rankedListings.length
                    : undefined,
            lastSearchQuery: searchQuery.trim() || undefined,
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
          setMessages((prev) =>
            [
              ...prev,
              {
                role: "assistant" as const,
                text: message,
              },
            ].slice(-6)
          );
          speakReply(message);
          if (open && !options?.fromSearchBar) showToast(message, "info");
          return { ok: true, reply: message };
        }

        const hasExecutableAction = res.actions.type !== "none";

        if (!res.reply && !hasExecutableAction) {
          const fallback = BUDDY_REPEAT_PROMPT;
          if (!options?.fromSearchBar) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                text: fallback,
              },
            ]);
          }
          speakReply(fallback);
          if (open && !options?.fromSearchBar) showToast(fallback, "info");
          return { ok: true, reply: fallback, actions: res.actions };
        }

        setLastError(undefined);
        const isStateSearch =
          res.actions.type === "search" ||
          res.actions.type === "empty_search" ||
          res.actions.type === "browse_all";
        const assistantText = isStateSearch
          ? res.actions.type === "browse_all"
            ? sanitizeAgentReplyForDisplay(res.reply) ||
              res.actions.replyMessage ||
              buildBrowseAllReply(res.actions.listingCount)
            : res.actions.type === "search"
            ? sanitizeAgentReplyForDisplay(res.reply) || "Atidarau skelbimus ekrane."
            : buildEmptySearchReply(trimmed)
          : sanitizeAgentReplyForDisplay(res.reply) || res.reply || "Atlikta.";

        const lastAssistantText = [...messages]
          .reverse()
          .find((m) => m.role === "assistant")?.text
          ?.trim();
        const shouldAppendAssistant =
          assistantText.trim() &&
          (options?.fromSearchBar && isStateSearch
            ? true
            : assistantText.trim() !== lastAssistantText);

        if (shouldAppendAssistant) {
          const structuredReplies = res.quickReplies?.filter(Boolean).slice(0, 4);
          setMessages((prev) =>
            [
              ...prev,
              {
                role: "assistant" as const,
                text: assistantText,
                ...(structuredReplies && structuredReplies.length >= 2
                  ? { quickReplies: structuredReplies }
                  : {}),
              },
            ].slice(-6)
          );
        }
        speakReply(assistantText);
        if (hasExecutableAction) {
          if (
            res.actions.type === "listing_draft" &&
            resolveBrowseAllIntent(trimmed)
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
        setMessages((prev) =>
          [
            ...prev,
            { role: "assistant" as const, text: message },
          ].slice(-6)
        );
        speakReply(message);
        if (open) showToast(message, "info");
        return { ok: true, reply: message };
      } finally {
        touchAgentSessionActivity();
        busyGate.release(options?.skipBusyCheck);
        drainAgentQueue();
      }
    },
    [
      applyActions,
      busyGate,
      lastError,
      listings,
      messages,
      showToast,
      setViewMode,
      user,
      isAuthenticated,
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
      sellerWizardContext,
      startListingFromQuery,
      trackEvent,
      getBehaviorSnapshot,
      teardownVoiceAfterUiAction,
      marketplaceFilters,
      applyVisualSearch,
      pathname,
      submitSellerContent,
      updateAiDraft,
      sellerVisionRecoveryActive,
      submitSellerClarification,
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
      setMessages((prev) => (isolated ? [assistantMsg] : [...prev, assistantMsg].slice(-6)));
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
    }),
    [open, openWithGreeting, messages, busy, streamThinkingLabel, sendAgentMessage, applyActions, reportAgentError]
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

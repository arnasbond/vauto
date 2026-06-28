"use client";

import { usePathname } from "next/navigation";
import { Loader2, Mic, Send, Sparkles, X } from "lucide-react";
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
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { apiVautoAgent } from "@/lib/api/client";
import { BUDDY_REPEAT_PROMPT, buddyMessageForAgentFailure } from "@/lib/voice-graceful";
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
  resolveAccountTypeLabel,
  resolveAgentNoiseReply,
  resolveAgentUserRole,
  summarizeMyListingsSummary,
  touchAgentSessionActivity,
  type AgentChatMessage,
} from "@/lib/vauto-agent-client";
import { registerWanted } from "@/lib/matching-service";
import { useAdminProjectContextForAgent } from "@/context/AdminProjectContext";
import { useNavigation, viewTitle } from "@/context/NavigationContext";
import { useZeroUiScreen } from "@/context/ZeroUiScreenContext";
import { useZeroUiMemory } from "@/context/ZeroUiMemoryContext";
import {
  microPaymentFromToolResult,
  resolveClientMonetizationState,
} from "@/lib/monetization-engine";
import type { ZeroUiScreen } from "@/lib/zero-ui-screens";
import {
  filtersFromSearchAction,
  parseSearchFiltersFromUserText,
  selectAgentSessionMessages,
  shouldResetSearchSession,
} from "@/lib/agent-session-memory";
import { isVoiceSearchSupported, recycleSpeechRecognitionEngine, startVoiceSearch } from "@/lib/voice-search";
import { VOICE_SILENCE_DEBOUNCE_MS } from "@/lib/speech-transcript";
import { ensureSpeechVoicesReady, lockSessionLocale } from "@/lib/SpeechEngine";
import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";
import { parseViewModeIntent, isViewModeOnlyCommand, mergeAgentIntoMarketplaceFilters } from "@/lib/marketplace-view";
import { mergeVoiceUiFilters, applyVoiceUiCommand } from "@/lib/voice-ui-actions";
import { parseVoiceUiCommand } from "@/lib/voice-ui-commands";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import {
  buildEmptySearchReply,
  sanitizeAgentReplyForDisplay,
  truncateVoiceReply,
} from "@/lib/agent-reply-display";
import { completeVoiceTeardown, isUiDrivingAgentAction } from "@/lib/voice-teardown";
import {
  apiCreateUserRequirement,
  type ProactiveOfferContext,
} from "@/lib/offer-engine-client";

export interface AgentSendOptions {
  skipBusyCheck?: boolean;
  pendingImageUrls?: string[];
  /** User input came from microphone in agent sheet or search bar */
  fromVoice?: boolean;
  /** Submitted from main SearchBar — Gemini must route via function calling */
  fromSearchBar?: boolean;
  /** Proactive Offer Engine — no-match lead or bargaining signal */
  proactiveOffer?: ProactiveOfferContext;
}

interface VautoAgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openWithGreeting: (text: string) => void;
  messages: AgentChatMessage[];
  busy: boolean;
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
    listings,
    user,
    setSearchQuery,
    setSearchInputMode,
    setSearchVoiceMode,
    searchInputMode,
    searchVoiceMode,
    applyAgentListingDraft,
    setListingBanned,
    markListingSold,
    showToast,
    isAuthenticated,
    openAuthModal,
    subscribeWishlist,
    rankedListings,
    searchQuery,
    setAgentPinnedListings,
    setViewMode,
    setMarketplaceFilters,
    marketplaceFilters,
    clearVisualSearch,
    toggleSave,
    aiDraft,
    sellerStep,
    activateWardrobeSpinta,
    startChat,
  } = useVauto();
  const pathname = usePathname();
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
    if (!aiDraft || sellerStep === "idle") return {};
    return {
      wizardMode: "listing_review" as const,
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
  const adminProjectContext = useAdminProjectContextForAgent();
  const includeAdminContext = Boolean(adminProjectContext);
  const [lastError, setLastError] = useState<
    { code: string; message?: string } | undefined
  >();

  const routeZeroUiScreen = useCallback(
    (screen: ZeroUiScreen) => {
      if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") !== "") {
        window.location.assign("/");
      }
      setScreen(screen, "agent");
    },
    [setScreen]
  );

  const applyActions = useCallback(
    (actions: import("@/lib/vauto-agent-client").VautoAgentAction) => {
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
        showToast(
          actions.listingIds.length
            ? `Rasta ${actions.listingIds.length} skelbimų`
            : "Rezultatų nerasta",
          actions.listingIds.length ? "success" : "info"
        );
        window.setTimeout(() => focusSearchOutcome(actions.listingIds.length), 120);
      }
      if (actions.type === "listing_draft") {
        const draft = mapAgentDraftToListing(actions.listingDraft);
        applyAgentListingDraft(draft, actions.imageUrl);
        routeZeroUiScreen("listing_preview");
        setOpen(false);
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
        setOpen(false);
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
        if (actions.activateWardrobe) {
          activateWardrobeSpinta();
          trackEvent("spinta_enter", { source: "agent_navigate", screen: actions.screen });
        }
        setOpen(false);
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
            routeZeroUiScreen("listing_preview");
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
            window.location.assign(actions.path);
          } else {
            goToMarketplace("agent");
          }
        }
        if (actions.label) showToast(actions.label, "success");
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
        trackEvent("agent_action", {
          action: "propose_bargaining",
          listingId: actions.listingId,
          suggestedOfferMin: actions.suggestedOfferMin,
          suggestedOfferMax: actions.suggestedOfferMax,
        });
        if (actions.label) showToast(actions.label, "info");
        if (actions.openChat) {
          const chatId = startChat(actions.listingId);
          if (chatId && typeof window !== "undefined") {
            window.location.assign(`/chats/thread/?id=${chatId}`);
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
        routeZeroUiScreen("listing_preview");
      }
      if (actions.type === "zero_ui_screen") {
        routeZeroUiScreen(actions.screen);
        showToast(`Zero-UI: ${actions.screen.replace(/_/g, " ")}`, "info");
      }
      if (actions.type === "navigate") {
        const view = actions.view;
        if (view === "add_listing" || view === "seller_wizard") {
          routeZeroUiScreen("listing_preview");
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
    },
    [
      markListingSold,
      applyAgentListingDraft,
      goToMarketplace,
      isAuthenticated,
      navigateTo,
      openAuthModal,
      routeZeroUiScreen,
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
      if (busy && !options?.skipBusyCheck) {
        return { ok: false, error: "AI agentas užimtas — bandykite po akimirkos" };
      }

      const voiceReply = Boolean(
        options?.fromVoice || searchVoiceMode || searchInputMode === "voice"
      );
      const speakReply = (replyText: string) => {
        const clean = sanitizeAgentReplyForDisplay(replyText.trim());
        if (clean && voiceReply) {
          speakBuddyMessage(truncateVoiceReply(clean), { enabled: true, force: true });
        }
      };

      if (isTooShortAgentQuery(trimmed)) {
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

      const lastActiveAt = readAgentSessionLastActiveAt();
      const sessionExpired =
        isAgentSessionExpired(lastActiveAt) && messages.length > 1;
      const lastSessionTopic = sessionExpired
        ? extractLastSessionTopic(messages)
        : undefined;

      let conversationBase = messages;
      if (sessionExpired) {
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

      const userMsg: AgentChatMessage = { role: "user", text: trimmed };
      const nextMessages = [...conversationBase, userMsg];
      if (!options?.fromSearchBar) {
        setMessages(nextMessages);
      }
      noteUserMessage(trimmed);
      trackEvent("agent_message", {
        text: trimmed.slice(0, 120),
        fromVoice: voiceReply,
        fromSearchBar: Boolean(options?.fromSearchBar),
      });
      setBusy(true);

      const sessionMessages = options?.fromSearchBar
        ? [{ role: "user" as const, text: trimmed }]
        : selectAgentSessionMessages(nextMessages);
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
          speakReply(viewReply);
          setBusy(false);
          return { ok: true, reply: "Vaizdas perjungtas." };
        }
      }

      const voiceCmd = parseVoiceUiCommand(trimmed);
      if (voiceCmd.type !== "none") {
        const handled = applyVoiceUiCommand(voiceCmd, {
          activeListingId: currentPageContext.active_listing_id,
          marketplaceFilters,
          setMarketplaceFilters,
          toggleSave,
          showToast,
        });
        if (handled.handled) {
          const reply = handled.reply ?? "Atlikta.";
          setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
          speakReply(reply);
          setBusy(false);
          touchAgentSessionActivity();
          return { ok: true, reply };
        }
      }

      try {
        const res = await apiVautoAgent({
          messages: sessionMessages.map((m) => ({ role: m.role, text: m.text })),
          context: {
            ...memoryContext,
            ...sellerWizardContext,
            activeSearchFilters: searchSessionReset
              ? resetFilters
              : memoryContext.activeSearchFilters,
            searchSessionReset,
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
            pendingImageUrls: options?.pendingImageUrls,
            lastError,
            isAuthenticated,
            searchResultCount:
              options?.proactiveOffer?.kind === "no_match"
                ? 0
                : searchQuery.trim()
                  ? rankedListings.length
                  : undefined,
            lastSearchQuery: searchQuery.trim() || undefined,
            currentView: zeroUiScreen,
            fromVoice: voiceReply,
            fromSearchBar: options?.fromSearchBar,
            behaviorHistory: getBehaviorSnapshot(),
            proactiveOffer: options?.proactiveOffer,
          },
          ...(includeAdminContext ? { includeAdminContext: true } : {}),
        });

        if (!res.ok) {
          const message = buddyMessageForAgentFailure(res.error);
          if (!options?.fromSearchBar) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                text: message,
              },
            ]);
          }
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
          res.actions.type === "search" || res.actions.type === "empty_search";
        const assistantText = isStateSearch
          ? res.actions.type === "search"
            ? sanitizeAgentReplyForDisplay(res.reply) || "Atidarau skelbimus ekrane."
            : buildEmptySearchReply(trimmed)
          : sanitizeAgentReplyForDisplay(res.reply) || res.reply || "Atlikta.";
        if (!options?.fromSearchBar) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: assistantText,
            },
          ]);
        }
        speakReply(assistantText);
        if (hasExecutableAction) {
          if (!options?.fromSearchBar) {
            applyActions(res.actions);
          }
          if (voiceReply) {
            void teardownVoiceAfterUiAction(res.actions);
          }
        }
        if (options?.fromSearchBar) {
          setOpen(false);
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
        speakReply(message);
        if (open) showToast(message, "info");
        return { ok: true, reply: message };
      } finally {
        touchAgentSessionActivity();
        setBusy(false);
      }
    },
    [
      applyActions,
      busy,
      lastError,
      listings,
      messages,
      showToast,
      setViewMode,
      user,
      isAuthenticated,
      rankedListings,
      searchQuery,
      includeAdminContext,
      buildAgentContext,
      noteUserMessage,
      zeroUiScreen,
      open,
      activeSearchFilters,
      clearSearchFilters,
      activeBoost,
      openMicroPayment,
      myListingsForAgent,
      currentPageContext,
      toggleSave,
      marketplaceFilters,
      setMarketplaceFilters,
      searchVoiceMode,
      searchInputMode,
      aiDraft,
      sellerStep,
      sellerWizardContext,
      trackEvent,
      getBehaviorSnapshot,
      teardownVoiceAfterUiAction,
    ]
  );

  const reportAgentError = useCallback((code: string, message?: string) => {
    setLastError({ code, message });
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
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSearchInputMode("voice");
      setSearchVoiceMode(true);
      setOpen(true);
      setMessages((prev) => [...prev, { role: "assistant", text: trimmed }]);
      speakBuddyMessage(trimmed, { enabled: true });
    },
    [setSearchInputMode, setSearchVoiceMode]
  );

  const value = useMemo(
    () => ({
      open,
      setOpen,
      openWithGreeting,
      messages,
      busy,
      sendAgentMessage,
      applyAgentActions: applyActions,
      reportAgentError,
    }),
    [open, openWithGreeting, messages, busy, sendAgentMessage, applyActions, reportAgentError]
  );

  return (
    <VautoAgentContext.Provider value={value}>
      {children}
      <VautoAgentSheet />
    </VautoAgentContext.Provider>
  );
}

export function useVautoAgent(): VautoAgentContextValue {
  const ctx = useContext(VautoAgentContext);
  if (!ctx) throw new Error("useVautoAgent must be used within VautoAgentProvider");
  return ctx;
}

function VautoAgentSheet() {
  const { open, setOpen, messages, busy, sendAgentMessage } = useVautoAgent();
  const { searchQuery, setSearchQuery, setSearchInputMode, setSearchVoiceMode } = useVauto();
  const pathname = usePathname();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";
  const [recording, setRecording] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState("");
  const voiceSessionRef = useRef<ReturnType<typeof startVoiceSearch> | null>(null);
  const lastVoiceDisplayRef = useRef("");

  const resetVoiceSessionAfterSend = useCallback(async () => {
    voiceSessionRef.current?.cancel();
    voiceSessionRef.current = null;
    setRecording(false);
    setVoiceCaption("");
    lastVoiceDisplayRef.current = "";
    await recycleSpeechRecognitionEngine();
  }, []);

  useEffect(() => {
    return () => voiceSessionRef.current?.cancel();
  }, []);

  const dispatchAgentMessage = useCallback(
    async (text: string, options?: AgentSendOptions) => {
      const clean = text.trim();
      if (!clean) return { ok: false, error: "Tuščia užklausa" };
      await resetVoiceSessionAfterSend();
      return sendAgentMessage(clean, options);
    },
    [resetVoiceSessionAfterSend, sendAgentMessage]
  );

  const handleVoice = () => {
    if (recording) {
      voiceSessionRef.current?.stop();
      return;
    }
    if (!isVoiceSearchSupported()) return;
    lockSessionLocale("lt-LT");
    void ensureSpeechVoicesReady();
    setRecording(true);
    setVoiceCaption("");
    lastVoiceDisplayRef.current = "";
    const session = startVoiceSearch({
      silenceMs: VOICE_SILENCE_DEBOUNCE_MS,
      onInterim: (preview) => {
        const clean = preview.trim();
        if (clean) setVoiceCaption(clean);
        else setVoiceCaption("");
      },
    });
    voiceSessionRef.current = session;
    void session.promise.then(async (text) => {
      setRecording(false);
      voiceSessionRef.current = null;
      const clean = (text ?? "").trim();
      setVoiceCaption("");
      if (!clean) return;
      lastVoiceDisplayRef.current = clean;
      setSearchInputMode("voice");
      setSearchVoiceMode(true);
      setOpen(true);
      await resetVoiceSessionAfterSend();
      void dispatchAgentMessage(clean, { skipBusyCheck: true, fromVoice: true });
    });
  };

  if (!open || onHome) return <VautoAgentFab />;

  return (
    <>
      <VautoAgentFab />
      <div
        className="fixed inset-0 z-[240] flex flex-col bg-[#0a1128] text-white"
        role="dialog"
        aria-modal="true"
        aria-label="VAUTO AI asistentas"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-700 bg-[#0a1128] px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:bg-slate-800"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2 pr-9">
            <Sparkles className="h-4 w-4 text-sky-400" />
            <h2 className="font-display text-base font-bold text-white">
              VAUTO Gemini
            </h2>
          </div>
        </header>

        <p className="shrink-0 border-b border-slate-700 bg-[#0f172a] px-4 py-2 text-center text-[11px] text-slate-400">
          Tas pats laukas kaip paieškoje viršuje — tekstas sinchronizuojamas.
        </p>

        <div className="flex-1 overflow-y-auto bg-[#0a1128] px-4 py-4 pb-28">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[88%] rounded-2xl rounded-tr-md bg-[#1167b1] px-4 py-3 text-sm leading-relaxed text-white"
                    : "max-w-[88%] rounded-lg border border-slate-700 bg-[#1e293b] p-3 text-sm leading-relaxed text-white"
                }
              >
                {sanitizeAgentReplyForDisplay(m.text) || m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Galvoju ir vykdau veiksmus…
            </div>
          )}
        </div>

        <form
          className="fixed bottom-0 left-0 right-0 border-t border-slate-700 bg-[#0a1128] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = searchQuery.trim();
            if (!t || busy) return;
            void dispatchAgentMessage(t);
          }}
        >
          <div className="mx-auto flex max-w-lg gap-2">
            {isVoiceSearchSupported() && (
              <button
                type="button"
                onClick={handleVoice}
                disabled={busy}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 text-slate-300 disabled:opacity-40 ${
                  recording ? "animate-pulse border-sky-400 text-sky-400" : ""
                }`}
                aria-label={recording ? "Sustabdyti balso įrašymą" : "Balso įvedimas"}
              >
                <Mic className="h-4 w-4" fill={recording ? "currentColor" : "none"} />
              </button>
            )}
            <input
              value={recording ? voiceCaption : searchQuery}
              onChange={(e) => {
                setVoiceCaption("");
                setSearchQuery(e.target.value);
              }}
              placeholder="Paklauskite Gemini — paieška, skelbimas, patarimai…"
              className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-sm text-white caret-sky-400 placeholder:text-slate-400 outline-none focus:border-sky-500"
              disabled={busy}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={busy || !searchQuery.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1167b1] text-white disabled:opacity-40"
              aria-label="Siųsti"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function VautoAgentFab() {
  const pathname = usePathname();
  const { open, setOpen } = useVautoAgent();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";

  if (open || onHome) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed bottom-24 right-4 z-[200] flex h-14 w-14 items-center justify-center rounded-full bg-[#1167b1] text-white shadow-lg shadow-[#1167b1]/30 hover:bg-[#0d5a9a]"
      aria-label="Atidaryti VAUTO asistentą"
      data-testid="vauto-agent-fab"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}

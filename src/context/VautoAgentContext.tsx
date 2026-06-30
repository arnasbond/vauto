"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  registerAgentGreetingHost,
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
import { persistPendingZeroUiScreen } from "@/lib/zero-ui-pending";
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
  buildEmptySearchReply,
  sanitizeAgentReplyForDisplay,
} from "@/lib/agent-reply-display";
import {
  mapAgentWardrobeItems,
  wardrobeBulkToDrafts,
} from "@/lib/agent-wardrobe-bridge";
import { completeVoiceTeardown, isUiDrivingAgentAction } from "@/lib/voice-teardown";
import { chatThreadPath } from "@/lib/chat-routes";
import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
  mergeAgentIntoMarketplaceFilters,
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
  openWithGreeting: (text: string, options?: { quickReplies?: string[] }) => void;
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
    applyAgentWardrobeBulk,
    pendingWardrobeBulkItems,
    publishBulkClothingListings,
  } = useVauto();
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
        navigateToAdd(draft.category === "clothing");
        setOpen(false);
      }
      if (actions.type === "wardrobe_bulk") {
        const items = mapAgentWardrobeItems(actions.items);
        if (items.length) {
          applyAgentWardrobeBulk(items, {
            imageUrl: actions.imageUrl,
            voiceAnnouncement: actions.voiceAnnouncement,
          });
          setOpen(false);
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
          navigateToAdd(Boolean(actions.params?.vertical === "fashion"));
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

      const voiceReply = false;
      const speakReply = (_replyText: string) => {
        /* v1.2 — text-only assistant, no TTS */
      };

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

      if (
        /patvirtinti visus/i.test(trimmed) &&
        pendingWardrobeBulkItems &&
        pendingWardrobeBulkItems.length > 1
      ) {
        const drafts = wardrobeBulkToDrafts(
          pendingWardrobeBulkItems,
          user.phone,
          user.city || "Vilnius"
        );
        const confirmText = `Puiku — publikuoju ${drafts.length} drabužių skelbimus!`;
        setMessages((prev) => [
          ...prev,
          { role: "user", text: trimmed },
          { role: "assistant", text: confirmText },
        ]);
        void publishBulkClothingListings(drafts);
        touchAgentSessionActivity();
        return { ok: true, reply: confirmText };
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
      setBusy(true);

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
          setBusy(false);
          return { ok: true, reply: "Vaizdas perjungtas." };
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

        const lastAssistantText = [...messages]
          .reverse()
          .find((m) => m.role === "assistant")?.text
          ?.trim();
        const shouldAppendAssistant =
          assistantText.trim() &&
          assistantText.trim() !== lastAssistantText;

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
      pendingWardrobeBulkItems,
      publishBulkClothingListings,
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
    (text: string, options?: { quickReplies?: string[] }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSearchInputMode("text");
      setSearchVoiceMode(false);
      const quickReplies = options?.quickReplies?.filter(Boolean).slice(0, 4);
      setMessages((prev) =>
        [
          ...prev,
          {
            role: "assistant" as const,
            text: trimmed,
            ...(quickReplies?.length ? { quickReplies } : {}),
          },
        ].slice(-6)
      );
    },
    [setSearchInputMode, setSearchVoiceMode]
  );

  useEffect(() => {
    registerAgentGreetingHost(openWithGreeting);
    return () => registerAgentGreetingHost(null);
  }, [openWithGreeting]);

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
    </VautoAgentContext.Provider>
  );
}

export function useVautoAgent(): VautoAgentContextValue {
  const ctx = useContext(VautoAgentContext);
  if (!ctx) throw new Error("useVautoAgent must be used within VautoAgentProvider");
  return ctx;
}

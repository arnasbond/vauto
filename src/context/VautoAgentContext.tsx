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
import { apiVautoAgent } from "@/lib/api/client";
import { sanitizeSpeechTranscript } from "@/lib/speech-transcript";
import { BUDDY_REPEAT_PROMPT, buddyMessageForAgentFailure } from "@/lib/voice-graceful";
import {
  compactListingsForAgent,
  mapAgentDraftToListing,
  registerAgentErrorReporter,
  resolveAgentUserRole,
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
import { isVoiceSearchSupported, startVoiceSearch } from "@/lib/voice-search";
import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";
import { runFastAgentSearch } from "@/lib/fast-agent-search";
import { parseViewModeIntent, isViewModeOnlyCommand, mergeAgentIntoMarketplaceFilters } from "@/lib/marketplace-view";
import { focusSearchOutcome } from "@/lib/search-results-focus";

export interface AgentSendOptions {
  skipBusyCheck?: boolean;
}

interface VautoAgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AgentChatMessage[];
  busy: boolean;
  sendAgentMessage: (
    text: string,
    options?: AgentSendOptions
  ) => Promise<WakeWordAgentResult>;
  reportAgentError: (code: string, message?: string) => void;
}

const VautoAgentContext = createContext<VautoAgentContextValue | null>(null);

export function VautoAgentProvider({ children }: { children: ReactNode }) {
  const {
    listings,
    user,
    setSearchQuery,
    setSearchInputMode,
    applyAgentListingDraft,
    setListingBanned,
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
  } = useVauto();
  const { navigateTo } = useNavigation();
  const { currentView: zeroUiScreen, setScreen, goToMarketplace, openMicroPayment, activeBoost } = useZeroUiScreen();
  const {
    buildAgentContext,
    noteUserMessage,
    recordSearchFilters,
    clearSearchFilters,
    activeSearchFilters,
  } = useZeroUiMemory();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      role: "assistant",
      text: "Sveiki! Aš esu VAUTO asistentas. Galiu padėti rasti skelbimus, paruošti naują skelbimą ar patarti dėl kainos. Kuo galiu padėti?",
    },
  ]);
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
        setSearchQuery(actions.searchQuery);
        setAgentPinnedListings(actions.listingIds);
        if (actions.filters) {
          setMarketplaceFilters(
            mergeAgentIntoMarketplaceFilters(
              marketplaceFilters,
              actions.filters,
              { resetAbsentGeo: true, resetAbsentCondition: true }
            )
          );
        }
        const nextFilters = filtersFromSearchAction(actions);
        if (actions.filtersReset) {
          clearSearchFilters();
        }
        if (nextFilters) recordSearchFilters(nextFilters);
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
        setAgentPinnedListings(null);
        clearVisualSearch({ keepInputMode: true });
        setSearchInputMode("text");
        setSearchQuery(actions.searchQuery);
        if (actions.filters) {
          setMarketplaceFilters(
            mergeAgentIntoMarketplaceFilters(
              marketplaceFilters,
              actions.filters,
              { resetAbsentGeo: true, resetAbsentCondition: true }
            )
          );
        }
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
    ]
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

      const userMsg: AgentChatMessage = { role: "user", text: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      noteUserMessage(trimmed);
      setBusy(true);

      const sessionMessages = selectAgentSessionMessages(nextMessages);
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
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text:
                viewIntent === "map"
                  ? "Perjungiu į žemėlapio vaizdą."
                  : viewIntent === "list"
                    ? "Perjungiu į sąrašo vaizdą."
                    : "Perjungiu į tinklelio vaizdą.",
            },
          ]);
          setBusy(false);
          return { ok: true, reply: "Vaizdas perjungtas." };
        }
      }

      const fast = await runFastAgentSearch(trimmed, listings, {
        userCity: user.city,
      });
      if (fast) {
        setLastError(undefined);
        const isStateSearch =
          fast.actions.type === "search" || fast.actions.type === "empty_search";
        const assistantText = isStateSearch
          ? fast.actions.type === "search"
            ? "Atidarau skelbimus ekrane."
            : "Rezultatų nerasta."
          : fast.reply;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: assistantText,
            toolCalls: fast.toolCalls,
          },
        ]);
        applyActions(fast.actions);
        setBusy(false);
        return { ok: true, reply: fast.reply };
      }

      try {
        const res = await apiVautoAgent({
          messages: sessionMessages.map((m) => ({ role: m.role, text: m.text })),
          context: {
            ...memoryContext,
            activeSearchFilters: searchSessionReset
              ? resetFilters
              : memoryContext.activeSearchFilters,
            searchSessionReset,
            monetization: resolveClientMonetizationState(user, activeBoost),
            userRole: resolveAgentUserRole(user),
            contact: user.phone || "+370 612 34567",
            listings: compactListingsForAgent(listings),
            lastError,
            isAuthenticated,
            searchResultCount: searchQuery.trim() ? rankedListings.length : undefined,
            lastSearchQuery: searchQuery.trim() || undefined,
            currentView: zeroUiScreen,
          },
          ...(includeAdminContext ? { includeAdminContext: true } : {}),
        });

        if (!res.ok) {
          const message = buddyMessageForAgentFailure(res.error);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: message,
            },
          ]);
          if (open) showToast(message, "info");
          return { ok: true, reply: message };
        }

        if (!res.reply) {
          const fallback = BUDDY_REPEAT_PROMPT;
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: fallback,
            },
          ]);
          if (open) showToast(fallback, "info");
          return { ok: true, reply: fallback };
        }

        setLastError(undefined);
        const isStateSearch =
          res.actions.type === "search" || res.actions.type === "empty_search";
        const assistantText = isStateSearch
          ? res.actions.type === "search"
            ? "Atidarau skelbimus ekrane."
            : "Rezultatų nerasta."
          : res.reply;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: assistantText,
            toolCalls: res.toolCalls,
          },
        ]);
        applyActions(res.actions);
        if (res.actions.type !== "micro_payment") {
          const paymentIntent = microPaymentFromToolResult(
            res.toolCalls.find((t) => t.name === "triggerMicroPayment")?.result
          );
          if (paymentIntent) {
            openMicroPayment(paymentIntent);
          }
        }
        return { ok: true, reply: res.reply };
      } catch {
        const message = BUDDY_REPEAT_PROMPT;
        if (open) showToast(message, "info");
        return { ok: true, reply: message };
      } finally {
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

  const value = useMemo(
    () => ({
      open,
      setOpen,
      messages,
      busy,
      sendAgentMessage,
      reportAgentError,
    }),
    [open, messages, busy, sendAgentMessage, reportAgentError]
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
  const { searchQuery, setSearchQuery } = useVauto();
  const pathname = usePathname();
  const onHome = pathname.replace(/\/$/, "") === "" || pathname === "/";
  const [recording, setRecording] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState("");
  const voiceSessionRef = useRef<ReturnType<typeof startVoiceSearch> | null>(null);
  const lastVoiceDisplayRef = useRef("");

  useEffect(() => {
    return () => voiceSessionRef.current?.cancel();
  }, []);

  const handleVoice = () => {
    if (recording) {
      voiceSessionRef.current?.stop();
      return;
    }
    if (!isVoiceSearchSupported()) return;
    setRecording(true);
    setVoiceCaption("");
    lastVoiceDisplayRef.current = "";
    const session = startVoiceSearch({
      onInterim: (text) => {
        const clean = sanitizeSpeechTranscript(text);
        if (!clean) return;
        setVoiceCaption(clean);
      },
      onFinal: (text) => {
        const clean = sanitizeSpeechTranscript(text);
        if (!clean) return;
        lastVoiceDisplayRef.current = clean;
        setVoiceCaption(clean);
        setSearchQuery(clean);
      },
    });
    voiceSessionRef.current = session;
    void session.promise.then((text) => {
      setRecording(false);
      voiceSessionRef.current = null;
      const clean = sanitizeSpeechTranscript(text ?? "");
      setVoiceCaption("");
      if (!clean) return;
      lastVoiceDisplayRef.current = clean;
      setSearchQuery(clean);
      void sendAgentMessage(clean);
      setOpen(false);
    });
  };

  if (!open || onHome) return <VautoAgentFab />;

  return (
    <>
      <VautoAgentFab />
      <div
        className="fixed inset-0 z-[240] flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="VAUTO AI asistentas"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[#e5e7eb] px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]"
            aria-label="Uždaryti"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center justify-center gap-2 pr-9">
            <Sparkles className="h-4 w-4 text-[#1167b1]" />
            <h2 className="font-display text-base font-bold text-[#111827]">
              VAUTO Gemini
            </h2>
          </div>
        </header>

        <p className="shrink-0 border-b border-[#e5e7eb] bg-[#f8fafc] px-4 py-2 text-center text-[11px] text-[#6b7280]">
          Tas pats laukas kaip paieškoje viršuje — tekstas sinchronizuojamas.
        </p>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-tr-md bg-[#1167b1] text-white"
                    : "rounded-tl-md bg-[#f3f4f6] text-[#111827]"
                }`}
              >
                {m.text}
                {m.toolCalls?.length ? (
                  <p className="mt-2 text-[10px] uppercase tracking-wide opacity-60">
                    {m.toolCalls.map((t) => t.name).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Galvoju ir vykdau veiksmus…
            </div>
          )}
        </div>

        <form
          className="fixed bottom-0 left-0 right-0 border-t border-[#e5e7eb] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = searchQuery.trim();
            if (!t || busy) return;
            void sendAgentMessage(t);
          }}
        >
          <div className="mx-auto flex max-w-lg gap-2">
            {isVoiceSearchSupported() && (
              <button
                type="button"
                onClick={handleVoice}
                disabled={busy}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#d1d5db] text-[#6b7280] disabled:opacity-40 ${
                  recording ? "animate-pulse border-[#1167b1] text-[#1167b1]" : ""
                }`}
                aria-label={recording ? "Sustabdyti balso įrašymą" : "Balso įvedimas"}
              >
                <Mic className="h-4 w-4" fill={recording ? "currentColor" : "none"} />
              </button>
            )}
            <input
              value={recording && voiceCaption ? voiceCaption : searchQuery}
              onChange={(e) => {
                setVoiceCaption("");
                setSearchQuery(e.target.value);
              }}
              placeholder="Paklauskite Gemini — paieška, skelbimas, patarimai…"
              className="min-w-0 flex-1 rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm text-[#111827] caret-[#1167b1] placeholder:text-[#9ca3af] outline-none focus:border-[#1167b1]"
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

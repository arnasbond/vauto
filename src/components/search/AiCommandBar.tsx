"use client";
// @disk-refresh 2026-07-08T00:04 — supervisor DOM fixes

import { ArrowUp, Camera, ChevronDown, Loader2, MessageCircle, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  executeConductorRoute,
  conductorPhotoUploadSource,
  conductorSearchQuerySource,
  readConductorSearchExecute,
  conductorShouldDelegateLegacy,
} from "@/lib/vauto-conductor";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { subscribeHomeReset } from "@/lib/home-reset";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { AI_FIRST_SEARCH_PLACEHOLDER } from "@/lib/ai-first-search-vision";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { useFlowUiSkin } from "@/hooks/useFlowUiSkin";
import { resolveBrowseAllIntent, createBrowseAllAction } from "@/lib/browse-all-intent";
import { resolveSupervisorChatTurn } from "@/lib/agent-chat-layout";
import { hapticImpactLight } from "@/lib/haptic-feedback";
import { WIZARD_AGENT_EXPAND_EVENT } from "@/lib/ai-conversational-recovery";
import { AgentTypingIndicator } from "@/components/home/AgentTypingIndicator";
import { ChatComposerAttachments } from "@/components/home/ChatComposerAttachments";
import {
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  pickNativeChatMedia,
} from "@/lib/chat-composer-media";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";
import { prepareChatImagesForAgent } from "@/lib/prepare-chat-images-for-agent";
import { peekPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import {
  inferListingFlowState,
  listingFlowComposerPlaceholder,
  listingFlowComposerTextLocked,
} from "@/lib/listing-conversational-flow";

const GEMINI_BLUE = "#1167b1";

export type AiCommandBarPlacement = "hero" | "top" | "inline" | "wizard" | "chat";

export interface AiCommandBarProps {
  placement?: AiCommandBarPlacement;
  phase?: AgentFlowPhase;
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  className?: string;
  /** Wizard mode — collapsed FAB until tap or new assistant reply. */
  collapsible?: boolean;
}

/**
 * P10 — unified AI Command Bar: top search, hero, inline, and collapsible wizard FAB.
 */
export function AiCommandBar({
  placement = "inline",
  phase = "idle",
  seedQuery,
  onSeedConsumed,
  className,
  collapsible = false,
}: AiCommandBarProps) {
  const isWizard = placement === "wizard";
  const isChatBar = placement === "chat";
  const isTopBar = placement === "hero" || placement === "top";

  const {
    requestMediaConsent,
    setSearchInputMode,
    clearVisualSearch,
    showToast,
    chameleonTheme,
    listings,
  } = useVauto();
  const { sellerStep, sellerVisionRecoveryActive, aiDraft } = useSellerFlow();
  const {
    searchQuery,
    setSearchQuery,
    setSearchLoading,
    searchLoading,
    setAgentPinnedListings,
    setViewMode,
  } = useVautoSearch();

  const pathname = usePathname();
  const { trackEvent } = useUserBehavior();
  const {
    messages,
    sendAgentMessage,
    busy: agentBusy,
    applyAgentActions,
    openWithGreeting,
    streamThinkingLabel,
    setOpen,
  } = useVautoAgent();
  const skin = useFlowUiSkin();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [wizardExpanded, setWizardExpanded] = useState(!collapsible);
  const [previewPulse, setPreviewPulse] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<string[]>([]);
  const [isPickingChatMedia, setIsPickingChatMedia] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevAssistantRef = useRef("");

  const forceBlankSearchInput = useCallback(() => {
    setSearchQuery("");
    setDraftQuery("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [setSearchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setDraftQuery("");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    return subscribeHomeReset(() => {
      setIsPhotoSearching(false);
      setDraftQuery("");
      setComposerAttachments([]);
    });
  }, []);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive = agentBusy || searchLoading || isPhotoSearching;

  const wardrobeSearchOnly =
    pathname === "/fashion" || pathname === "/fashion/";

  const scrollToResults = () => {
    document
      .getElementById("listing-results")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const syncGridFromAgentActions = useCallback(
    (actions: VautoAgentAction | undefined) => {
      if (!actions || actions.type === "none") return;
      forceBlankSearchInput();
      applyAgentActions(actions);
      if (actions.type === "search") {
        focusSearchOutcome(actions.listingIds.length);
      } else if (actions.type === "browse_all") {
        focusSearchOutcome(actions.listingCount ?? 1);
        scrollToResults();
      } else if (
        actions.type === "empty_search" ||
        actions.type === "apply_ui_filters" ||
        actions.type === "navigate_to_screen"
      ) {
        focusSearchOutcome(0);
      }
    },
    [applyAgentActions, forceBlankSearchInput]
  );

  const commitSearch = useCallback(
    async (raw: string) => {
      const q = stripLegacyCategorySuffixes(sanitizeSearchQuery(raw, "final"));
      if (!q) return;

      trackEvent("search_submit", {
        query: q,
        voice: false,
        wardrobeMode: wardrobeSearchOnly,
        pathname: pathname ?? "/",
      });

      setSearchInputMode("text");
      clearVisualSearch({ keepInputMode: true });

      const viewIntent = parseViewModeIntent(q);
      if (viewIntent) setViewMode(viewIntent);

      if (isViewModeOnlyCommand(q)) {
        setDraftQuery(q);
        setSearchQuery(q);
        setAgentPinnedListings(null);
        scrollToResults();
        return;
      }

      if (resolveBrowseAllIntent(raw, q)) {
        const activeCount = listings.filter(
          (l) => !l.banned && l.price > 0 && l.status !== "sold"
        ).length;
        const actions = createBrowseAllAction(activeCount);
        setDraftQuery("");
        setSearchQuery("");
        setSearchLoading(true);
        try {
          syncGridFromAgentActions(actions);
          openWithGreeting(actions.replyMessage, { openSheet: false });
        } finally {
          setSearchLoading(false);
        }
        return;
      }

      setDraftQuery(q);
      clearVisualSearch({ keepInputMode: true });
      setSearchLoading(true);
      try {
        setAgentPinnedListings(null);
        const route = await executeConductorRoute({
          ...conductorSearchQuerySource("AiCommandBar"),
          payload: { query: q, wardrobeSearchOnly },
        });
        if (!conductorShouldDelegateLegacy(route)) {
          const exec = readConductorSearchExecute(route);
          if (exec?.agentResult.actions) {
            syncGridFromAgentActions(exec.agentResult.actions);
          } else if (exec?.agentResult.ok) {
            scrollToResults();
          }
          scrollToResults();
          return;
        }
        const res = await sendAgentMessage(q, { fromSearchBar: true });
        if (res.actions) syncGridFromAgentActions(res.actions);
        else if (res.ok) forceBlankSearchInput();
        else if (res.reply) {
          scrollToResults();
        }
      } finally {
        setSearchLoading(false);
      }
    },
    [
      clearVisualSearch,
      setAgentPinnedListings,
      setSearchInputMode,
      setSearchQuery,
      setSearchLoading,
      setViewMode,
      sendAgentMessage,
      syncGridFromAgentActions,
      forceBlankSearchInput,
      pathname,
      trackEvent,
      wardrobeSearchOnly,
      listings,
      openWithGreeting,
    ]
  );

  const lastSeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedQuery?.trim() || seedQuery === lastSeedRef.current) return;
    lastSeedRef.current = seedQuery;
    setDraftQuery(seedQuery);
    void commitSearch(seedQuery).finally(() => onSeedConsumed?.());
  }, [seedQuery, commitSearch, onSeedConsumed]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (placement === "wizard" || placement === "chat" || phase === "listing_processing") {
        const trimmed = draftQuery.trim();
        const attachments = isChatBar ? composerAttachments : [];
        if ((!trimmed && !attachments.length) || agentBusy) return;
        if (placement !== "chat" && resolveBrowseAllIntent(trimmed)) {
          setDraftQuery("");
          void commitSearch(trimmed);
          if (collapsible) {
            void hapticImpactLight();
            setWizardExpanded(false);
          }
          return;
        }
        const msg = trimmed;
        const images = attachments.slice(0, MAX_CHAT_COMPOSER_ATTACHMENTS);
        try {
          const prepared = images.length
            ? await prepareChatImagesForAgent(images)
            : {
                listingImageUrls: [] as string[],
                agentVisionUrls: [] as string[],
                suspectedDocumentUrls: [] as string[],
              };
          // Clear composer only after a successful handoff — otherwise a short-circuit
          // (or transport failure) would wipe photos and draft text with nothing sent.
          const allWire = prepared.agentVisionUrls.length
            ? prepared.agentVisionUrls
            : prepared.listingImageUrls;
          const res = await sendAgentMessage(msg, {
            ...(allWire.length
              ? {
                  // Zero pre-filter: all attachments → Gemini. Gallery strip post-vision.
                  sessionImageUrls: allWire,
                  pendingImageUrls: allWire,
                  ...(prepared.suspectedDocumentUrls?.length
                    ? { documentImageUrls: prepared.suspectedDocumentUrls }
                    : {}),
                }
              : {}),
          });
          if (res.ok) {
            setDraftQuery("");
            if (isChatBar) setComposerAttachments([]);
          }
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err ?? "");
          showToast(
            /413|payload|failed to fetch|network/i.test(raw)
              ? "Nuotraukų siuntimas nepavyko — bandykite dar kartą arba įkelkite po 2–3."
              : "Nepavyko išsiųsti žinutės — bandykite dar kartą.",
            "info"
          );
        }
        if (collapsible) {
          void hapticImpactLight();
          if (!sellerVisionRecoveryActive) setWizardExpanded(false);
        }
        return;
      }
      void commitSearch(draftQuery);
      inputRef.current?.blur();
    },
    [
      placement,
      phase,
      draftQuery,
      agentBusy,
      sendAgentMessage,
      commitSearch,
      collapsible,
      sellerVisionRecoveryActive,
      isChatBar,
      composerAttachments,
      showToast,
    ]
  );

  const handleChatMediaAttach = useCallback(() => {
    if (isPickingChatMedia || agentBusy) return;
    if (composerAttachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS) {
      showToast(`Galima pridėti iki ${MAX_CHAT_COMPOSER_ATTACHMENTS} nuotraukų.`, "info");
      return;
    }
    requestMediaConsent(() => {
      void (async () => {
        setIsPickingChatMedia(true);
        try {
          const picked = await pickNativeChatMedia(composerAttachments.length);
          if (picked.length) {
            setComposerAttachments((prev) =>
              [...prev, ...picked].slice(0, MAX_CHAT_COMPOSER_ATTACHMENTS)
            );
          }
        } catch {
          showToast("Nepavyko pridėti nuotraukų — bandykite dar kartą.", "info");
        } finally {
          setIsPickingChatMedia(false);
        }
      })();
    });
  }, [
    agentBusy,
    composerAttachments.length,
    isPickingChatMedia,
    requestMediaConsent,
    showToast,
  ]);

  const handlePhotoSearch = () => {
    if (isChatBar) {
      handleChatMediaAttach();
      return;
    }
    if (isPhotoSearching || agentBusy) return;
    void executeConductorRoute({
      ...conductorPhotoUploadSource("AiCommandBar"),
      payload: { photoCount: 1, wardrobeSearchOnly },
    });
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      onBusyChange: setIsPhotoSearching,
      onErrorMessage: (message) => showToast(message, "info"),
    });
  };

  const lastAssistant = useMemo(() => {
    return resolveSupervisorChatTurn(messages).assistant?.text ?? "";
  }, [messages]);

  const busy = agentBusy || searchLoading || isPhotoSearching;
  const hasAssistantPing = Boolean(lastAssistant) || busy;

  const toggleWizardExpanded = useCallback((next: boolean) => {
    void hapticImpactLight();
    setWizardExpanded(next);
    if (next) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isWizard || !collapsible || wizardExpanded) return;
    if (!lastAssistant || lastAssistant === prevAssistantRef.current) return;
    prevAssistantRef.current = lastAssistant;
    setPreviewPulse(true);
    const t = window.setTimeout(() => setPreviewPulse(false), 2400);
    return () => window.clearTimeout(t);
  }, [lastAssistant, isWizard, collapsible, wizardExpanded]);

  useEffect(() => {
    const onExpand = () => toggleWizardExpanded(true);
    window.addEventListener(WIZARD_AGENT_EXPAND_EVENT, onExpand);
    return () => window.removeEventListener(WIZARD_AGENT_EXPAND_EVENT, onExpand);
  }, [toggleWizardExpanded]);

  useEffect(() => {
    if (sellerVisionRecoveryActive && collapsible) {
      toggleWizardExpanded(true);
    }
  }, [sellerVisionRecoveryActive, collapsible, toggleWizardExpanded]);

  const listingFlowState = inferListingFlowState({
    listingFlowState: aiDraft?.listingFlowState,
    hasDraft: Boolean(aiDraft?.title?.trim()),
    photoCount: aiDraft?.orderedImageUrls?.length ?? 0,
  });
  const flowPlaceholder = listingFlowComposerPlaceholder(listingFlowState);
  const confirmationLocked = listingFlowComposerTextLocked(listingFlowState);

  const wizardPlaceholder =
    flowPlaceholder ??
    (sellerVisionRecoveryActive
      ? "Pvz. „Parduodu Citroen DS5, numeris NOG675“…"
      : phase === "listing_processing"
      ? "Agentas apdoroja — galite rašyti patikslinimus…"
      : skin.variant === "spinta"
        ? "Rašykite Spintos sekretorei — pvz. „pakeisk dydį į M“"
        : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“");

  const inputPlaceholder = isWizard
    ? wizardPlaceholder
    : isChatBar
      ? flowPlaceholder ?? "Rašykite atsakymą…"
    : isTopBar
      ? AI_FIRST_SEARCH_PLACEHOLDER
      : "Rašykite paiešką… (nuotrauka: nuskenuosiu brūkšninį kodą)";

  const composerFormClass = cn(
    "pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-xl",
    isWizard ? skin.composerBorder : "border-[var(--vauto-border)]",
    isWizard ? skin.composerBg : "bg-[var(--vauto-card-bg)]"
  );

  const composerInputClass =
    "min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-main)] outline-none placeholder:text-[#4b5563] vauto-body-text";

  const composerButtonClass = isWizard
    ? cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40",
        skin.composerButton
      )
    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] transition disabled:opacity-40";

  if (isWizard && collapsible && !wizardExpanded) {
    const barcodeOffer = peekPendingBarcodeOffer();
    const previewLine = (barcodeOffer?.message ?? lastAssistant).replace(/\s+/g, " ").trim();
    const previewSnippet =
      previewLine.length > 88 ? `${previewLine.slice(0, 88)}…` : previewLine;

    return (
      <div
        className={cn(
          "ai-wizard-fab-stack pointer-events-none fixed z-50 flex flex-col items-end",
          "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4",
          className
        )}
      >
        {previewSnippet && (
          <div
            className={cn(
              "ai-wizard-fab-preview pointer-events-none mb-2 max-w-[min(17rem,calc(100vw-5.5rem))] rounded-2xl border px-3 py-2 text-left text-[11px] leading-snug shadow-lg backdrop-blur-md vauto-body-text",
              "border-[var(--vauto-border)] bg-[var(--vauto-card-bg)]/95 text-[var(--vauto-text-muted)]",
              previewPulse && "ai-wizard-fab-preview-pulse"
            )}
            role="status"
            aria-live="polite"
          >
            <Sparkles
              className={cn("mb-0.5 inline h-3 w-3 text-[var(--vauto-primary)]")}
              aria-hidden
            />{" "}
            {previewSnippet}
          </div>
        )}
        <button
          type="button"
          className={cn(
            "ai-wizard-fab pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border shadow-xl transition-transform duration-300 hover:scale-105 active:scale-95",
            skin.composerBorder,
            skin.composerBg
          )}
          onClick={() => toggleWizardExpanded(true)}
          aria-label="Atidaryti VAUTO asistentą"
          aria-expanded={false}
        >
          {busy ? (
            <Loader2 className={cn("h-6 w-6 animate-spin", skin.composerAccentIcon)} />
          ) : (
            <MessageCircle className={cn("h-6 w-6", skin.composerAccentIcon)} />
          )}
          {hasAssistantPing && !busy && (
            <span
              className="ai-wizard-fab-ping absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--vauto-accent)] ring-2 ring-[var(--vauto-bg)]"
              aria-hidden
            >
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </button>
      </div>
    );
  }

  if (isWizard) {
    return (
      <>
        <div
          className={cn(
            "ai-wizard-composer pointer-events-none fixed z-50",
            collapsible
              ? "ai-wizard-composer-floating bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 left-auto w-[min(22rem,calc(100vw-2rem))]"
              : "inset-x-0 bottom-0",
            collapsible && "ai-wizard-composer-expanded"
          )}
          aria-label="VAUTO AI komandų juosta"
        >
          <div className={cn(collapsible ? "px-0" : "mx-auto w-full max-w-lg px-3 md:max-w-3xl md:px-0", "pb-0")}>
            {isWizard && collapsible && (
              <div className="pointer-events-auto mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleWizardExpanded(false)}
                  className="flex items-center gap-1 rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-3 py-1 text-[11px] text-[var(--vauto-text-muted)] shadow-sm transition hover:bg-[var(--vauto-bg)]"
                  aria-label="Suskleisti asistentą"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                  Suskleisti
                </button>
              </div>
            )}
            {busy && isWizard && (
              <div className="pointer-events-auto mb-1.5">
                <AgentTypingIndicator variant="inline" label={streamThinkingLabel} />
              </div>
            )}
            {lastAssistant && isWizard && !busy && (
              <p
                className={cn(
                  "pointer-events-auto mb-1.5 line-clamp-3 rounded-xl border px-3 py-2 text-[12px] leading-relaxed shadow-md backdrop-blur-md vauto-body-text",
                  skin.composerBorder,
                  skin.composerBg,
                  "text-[var(--vauto-text-muted)]"
                )}
              >
                <Sparkles
                  className={cn("mr-1 inline h-3 w-3", skin.composerAccentIcon)}
                  aria-hidden
                />
                {lastAssistant.slice(0, 220)}
                {lastAssistant.length > 220 ? "…" : ""}
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className={composerFormClass}>
              <input
                ref={inputRef}
                type="text"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={phase === "listing_processing" && agentBusy}
                className={composerInputClass}
                enterKeyHint={isWizard ? "send" : "search"}
                aria-label="VAUTO AI komanda"
              />
              <button
                type="submit"
                disabled={!draftQuery.trim() || busy}
                className={composerButtonClass}
                aria-label={isWizard ? "Siųsti žinutę" : "Ieškoti"}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isWizard ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const canSendChat =
    Boolean(draftQuery.trim()) || composerAttachments.length > 0;

  return (
    <>
      <form
        className={cn(
          "border shadow-sm transition-colors",
          isChatBar &&
            "agent-chat-composer flex w-full flex-col gap-1.5 rounded-2xl border-[var(--vauto-primary)]/20 bg-[var(--vauto-bg)] p-2 shadow-md",
          !isChatBar && "flex items-center gap-2",
          isTopBar
            ? "home-ai-hero-search rounded-full py-2.5 pl-5 pr-2 shadow-md"
            : !isChatBar && "vauto-surface-panel rounded-xl py-1.5 pl-3.5 pr-1.5",
          zeroUiActive && "zero-ui-search-active",
          className
        )}
        style={{ borderColor: isTopBar ? "var(--vauto-border)" : ui.searchBorder }}
        onSubmit={(e) => void handleSubmit(e)}
        role={isChatBar ? undefined : "search"}
        aria-label={isChatBar ? "VAUTO asistento atsakymas" : "Skelbimų paieška"}
      >
        {isChatBar && composerAttachments.length > 0 ? (
          <ChatComposerAttachments
            urls={composerAttachments}
            onRemove={(index) =>
              setComposerAttachments((prev) => prev.filter((_, i) => i !== index))
            }
            className="px-0.5"
          />
        ) : null}

        <div className={cn("flex min-w-0 items-center gap-2", isChatBar && "w-full")}>
        {isChatBar ? (
          <button
            type="button"
            onClick={handleChatMediaAttach}
            disabled={
              busy ||
              confirmationLocked ||
              isPickingChatMedia ||
              composerAttachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-primary)]/10 disabled:opacity-40"
            aria-label="Pridėti nuotrauką"
            title="Pridėti nuotrauką"
          >
            {isPickingChatMedia ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-5 w-5" aria-hidden />
            )}
          </button>
        ) : (
          <Sparkles
            className={cn(
              "shrink-0 transition-opacity",
              isTopBar ? "h-5 w-5" : "h-4 w-4",
              agentBusy && "zero-ui-icon-pulse"
            )}
            style={{ color: isTopBar ? "var(--vauto-primary)" : GEMINI_BLUE }}
            aria-hidden
          />
        )}

        <input
          ref={inputRef}
          type={isChatBar ? "text" : "search"}
          name={isChatBar ? undefined : "q"}
          role={isChatBar ? undefined : "searchbox"}
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder={inputPlaceholder}
          enterKeyHint={isChatBar ? "send" : "search"}
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent outline-none vauto-body-text",
            isTopBar
              ? "text-[15px] text-[var(--vauto-text-main)] placeholder:text-[#4b5563]"
              : "text-sm text-[var(--vauto-text-main)] caret-[var(--vauto-primary)] placeholder:text-[#4b5563]"
          )}
          disabled={busy || (isChatBar && confirmationLocked)}
          readOnly={isChatBar && confirmationLocked}
          autoComplete="off"
        />

        <button
          type="submit"
          disabled={
            busy ||
            (isChatBar && confirmationLocked) ||
            (isChatBar ? !canSendChat : !draftQuery.trim())
          }
          className={cn(
            "flex shrink-0 items-center justify-center gap-1 rounded-xl font-semibold text-white transition disabled:opacity-40",
            isChatBar
              ? "h-10 min-w-[2.75rem] bg-[var(--vauto-primary)] px-3 text-[var(--vauto-primary-contrast)]"
              : isTopBar
              ? "h-11 bg-orange-600 px-4 hover:bg-orange-700"
              : "h-10 w-10 bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)]"
          )}
          aria-label={isChatBar ? "Siųsti" : "Ieškoti"}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isChatBar ? (
            <>
              <ArrowUp className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline text-sm">Siųsti</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden />
              {isTopBar && <span className="hidden sm:inline">Ieškoti</span>}
            </>
          )}
        </button>

        {!isChatBar ? (
        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-bg)] disabled:opacity-40",
            isTopBar ? "h-10 w-10" : "h-10 w-10 rounded-lg"
          )}
          aria-label="Vision AI paieška pagal nuotrauką"
          title="Vision AI — nuotrauka"
        >
          {isPhotoSearching ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
        ) : null}
        </div>
      </form>

      {!isTopBar && !isChatBar && (
        <>
          <p className="mt-2 text-center text-[11px] text-[var(--vauto-text-muted)]">
            📷 Nuotrauka — pokalbyje pasirinkite ieškoti ar parduoti. Tekstas — greitas Gemini chat.
          </p>
          <div className="mt-1.5 flex justify-center">
            <AiModeBadge compact />
          </div>
        </>
      )}
    </>
  );
}

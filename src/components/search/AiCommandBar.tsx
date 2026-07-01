"use client";

import { ArrowUp, Camera, ChevronDown, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
} from "@/lib/photo-vision-search";
import { interceptPhotoUploadForIntent } from "@/lib/photo-intent-intercept";
import { SCAN_NOT_RECOGNIZED_MSG } from "@/lib/ai-safeguards";
import {
  clearPhotoSearchSession,
} from "@/lib/photo-search-session";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { AiModeBadge } from "@/components/AiModeBadge";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import { cn } from "@/lib/cn";
import {
  parseViewModeIntent,
  isViewModeOnlyCommand,
} from "@/lib/marketplace-view";
import {
  AiPhotoFlowSheet,
  type AiPhotoFlowResult,
  type AiPhotoIntentChoice,
} from "@/components/photo/AiPhotoFlowSheet";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { subscribeHomeReset } from "@/lib/home-reset";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { AI_FIRST_SEARCH_PLACEHOLDER } from "@/lib/ai-first-search-vision";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { useFlowUiSkin } from "@/hooks/useFlowUiSkin";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";
import { hapticImpactLight } from "@/lib/haptic-feedback";
import { WIZARD_AGENT_EXPAND_EVENT } from "@/lib/ai-conversational-recovery";
import { peekPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";

const GEMINI_BLUE = "#1167b1";

export type AiCommandBarPlacement = "hero" | "top" | "inline" | "wizard";

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
  const isTopBar = placement === "hero" || placement === "top";

  const {
    requestMediaConsent,
    setSearchInputMode,
    clearVisualSearch,
    showToast,
    user,
    chameleonTheme,
    startListingFromQuery,
  } = useVauto();
  const { sellerStep, sellerVisionRecoveryActive, submitSellerClarification } = useSellerFlow();
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
  } = useVautoAgent();
  const skin = useFlowUiSkin();

  const [draftQuery, setDraftQuery] = useState(searchQuery);
  const [isPhotoSearching, setIsPhotoSearching] = useState(false);
  const [photoFlowOpen, setPhotoFlowOpen] = useState(false);
  const [photoIntentChoice, setPhotoIntentChoice] = useState<AiPhotoIntentChoice | null>(null);
  const [wizardExpanded, setWizardExpanded] = useState(!collapsible);
  const [previewPulse, setPreviewPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevAssistantRef = useRef("");

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    return subscribeHomeReset(() => {
      setPhotoFlowOpen(false);
      setIsPhotoSearching(false);
      setDraftQuery("");
    });
  }, []);

  const activeTheme =
    sellerStep !== "idle"
      ? chameleonTheme
      : portalExperienceForQuery(searchQuery).theme;
  const ui = useMemo(() => getPortalUi(activeTheme), [activeTheme]);

  const zeroUiActive = agentBusy || searchLoading || isPhotoSearching || photoFlowOpen;

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
      applyAgentActions(actions);
      if (actions.type === "search") {
        setDraftQuery(stripLegacyCategorySuffixes(actions.searchQuery));
        focusSearchOutcome(actions.listingIds.length);
      } else if (actions.type === "empty_search") {
        setDraftQuery(stripLegacyCategorySuffixes(actions.searchQuery));
        focusSearchOutcome(0);
      } else if (actions.type === "apply_ui_filters") {
        const q = actions.query?.trim() || actions.filters?.query?.trim();
        if (q) setDraftQuery(stripLegacyCategorySuffixes(q));
        focusSearchOutcome(0);
      } else if (actions.type === "navigate_to_screen") {
        if (actions.query?.trim()) {
          setDraftQuery(stripLegacyCategorySuffixes(actions.query.trim()));
        }
        focusSearchOutcome(0);
      }
    },
    [applyAgentActions]
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

      if (startListingFromQuery(q)) {
        setDraftQuery(q);
        return;
      }

      setDraftQuery(q);
      setAgentPinnedListings(null);
      clearVisualSearch({ keepInputMode: true });
      setSearchLoading(true);
      void sendAgentMessage(q, { fromSearchBar: true })
        .then((res) => {
          if (res.actions) syncGridFromAgentActions(res.actions);
          else if (res.ok) scrollToResults();
        })
        .finally(() => setSearchLoading(false));
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
      pathname,
      trackEvent,
      wardrobeSearchOnly,
      startListingFromQuery,
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
      if (placement === "wizard" || phase === "listing_processing") {
        const trimmed = draftQuery.trim();
        if (!trimmed || agentBusy) return;
        const msg = trimmed;
        setDraftQuery("");
        if (sellerVisionRecoveryActive) {
          await submitSellerClarification(msg);
        } else {
          await sendAgentMessage(msg);
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
    [placement, phase, draftQuery, agentBusy, sendAgentMessage, commitSearch, collapsible, sellerVisionRecoveryActive, submitSellerClarification]
  );

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (
    result: AiPhotoFlowResult
  ): Promise<boolean> => {
    setIsPhotoSearching(true);
    setPhotoIntentChoice(null);
    try {
      const intercept = await interceptPhotoUploadForIntent(result, {
        userCity: user.city,
        userName: user.name,
        wardrobeOnly: wardrobeSearchOnly,
        inlineInSheet: true,
        openWithGreeting,
        showToast,
        fallbackMessage: PHOTO_SEARCH_FALLBACK_MESSAGE,
      });
      if (intercept.handled && intercept.inline) {
        setPhotoIntentChoice(intercept.inline);
        return true;
      }
      if (intercept.handled) {
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }
      return false;
    } finally {
      setIsPhotoSearching(false);
    }
  };

  const handlePhotoScanTimeout = useCallback(() => {
    if (!isPhotoSearching) return;
    setIsPhotoSearching(false);
    showToast(SCAN_NOT_RECOGNIZED_MSG, "info");
    openWithGreeting(SCAN_NOT_RECOGNIZED_MSG, { openSheet: true });
  }, [isPhotoSearching, showToast, openWithGreeting]);

  const handlePhotoIntentChip = useCallback(
    (chip: string) => {
      setPhotoIntentChoice(null);
      setPhotoFlowOpen(false);
      clearPhotoSearchSession();
      void sendAgentMessage(chip, { fromSearchBar: true });
    },
    [sendAgentMessage]
  );

  const lastAssistant = useMemo(() => {
    const m = [...messages].reverse().find((x) => x.role === "assistant");
    if (!m?.text) return "";
    return sanitizeAgentReplyForDisplay(m.text) || m.text;
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

  const wizardPlaceholder =
    sellerVisionRecoveryActive
      ? "Pvz. „Parduodu Citroen DS5, numeris NOG675“…"
      : phase === "listing_processing"
      ? "Agentas apdoroja — galite rašyti patikslinimus…"
      : skin.variant === "spinta"
        ? "Rašykite Spintos sekretorei — pvz. „pakeisk dydį į M“"
        : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“";

  const inputPlaceholder = isWizard
    ? wizardPlaceholder
    : isTopBar
      ? AI_FIRST_SEARCH_PLACEHOLDER
      : "Rašykite paiešką arba įkelkite nuotrauką…";

  const composerFormClass = cn(
    "pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-xl",
    isWizard ? skin.composerBorder : "border-[var(--vauto-border)]",
    isWizard ? skin.composerBg : "bg-[var(--vauto-card-bg)]"
  );

  const composerInputClass =
    "min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-main)] outline-none placeholder:text-[var(--vauto-text-muted)] vauto-body-text";

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
          <div className={cn(collapsible ? "px-0" : "mx-auto max-w-lg px-3", "pb-0")}>
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
            {lastAssistant && isWizard && (
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

  return (
    <>
      <form
        className={cn(
          "flex items-center gap-2 border shadow-sm transition-colors",
          isTopBar
            ? "home-ai-hero-search rounded-[1.35rem] py-2.5 pl-4 pr-2"
            : "vauto-surface-panel rounded-xl py-1.5 pl-3.5 pr-1.5",
          zeroUiActive && "zero-ui-search-active",
          className
        )}
        style={{ borderColor: isTopBar ? "var(--vauto-border)" : ui.searchBorder }}
        onSubmit={(e) => void handleSubmit(e)}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles
          className={cn(
            "shrink-0 transition-opacity",
            isTopBar ? "h-5 w-5" : "h-4 w-4",
            agentBusy && "zero-ui-icon-pulse"
          )}
          style={{ color: isTopBar ? "var(--vauto-primary)" : GEMINI_BLUE }}
          aria-hidden
        />

        <input
          ref={inputRef}
          type="search"
          name="q"
          role="searchbox"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder={inputPlaceholder}
          enterKeyHint="search"
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent outline-none vauto-body-text",
            isTopBar
              ? "text-[15px] text-[var(--vauto-text-main)] placeholder:text-[var(--vauto-text-muted)]"
              : "text-sm text-[var(--vauto-text-main)] caret-[var(--vauto-primary)] placeholder:text-[var(--vauto-text-muted)]"
          )}
          disabled={busy}
          autoComplete="off"
        />

        <button
          type="button"
          onClick={handlePhotoSearch}
          disabled={isPhotoSearching || photoFlowOpen}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-bg)] disabled:opacity-40",
            isTopBar ? "h-11 w-11" : "h-10 w-10 rounded-lg"
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
      </form>

      {!isTopBar && (
        <>
          <p className="mt-2 text-center text-[11px] text-[var(--vauto-text-muted)]">
            📷 Vision AI — nuotraukos paieška ir analizė. Tekstas — greitas Gemini chat.
          </p>
          <div className="mt-1.5 flex justify-center">
            <AiModeBadge compact />
          </div>
        </>
      )}

      <AiPhotoFlowSheet
        open={photoFlowOpen}
        mode="intent"
        busy={isPhotoSearching}
        intentChoice={photoIntentChoice}
        onIntentChip={handlePhotoIntentChip}
        onScanTimeout={handlePhotoScanTimeout}
        onClose={() => {
          setPhotoIntentChoice(null);
          setPhotoFlowOpen(false);
        }}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}

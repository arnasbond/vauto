"use client";

import { ArrowUp, Camera, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  PHOTO_SEARCH_FALLBACK_MESSAGE,
  applyVisualPhotoSearchToGrid,
  runPhotoVisionSearch,
} from "@/lib/photo-vision-search";
import {
  clearPhotoSearchSession,
  persistPhotoSearchSession,
} from "@/lib/photo-search-session";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { buildVisualSearchProfile } from "@/lib/visual-search";
import { formatSearchAlternativeChips } from "@/lib/vision-choice-chips";
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
} from "@/components/photo/AiPhotoFlowSheet";
import { stripLegacyCategorySuffixes } from "@/lib/speech-transcript";
import { focusSearchOutcome } from "@/lib/search-results-focus";
import { subscribeHomeReset } from "@/lib/home-reset";
import type { ListingCategory } from "@/lib/types";
import type { VautoAgentAction } from "@/lib/vauto-agent-client";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";
import { buildVisionSearchAgentAction } from "@/lib/vision-agent-bridge";
import { AI_FIRST_SEARCH_PLACEHOLDER } from "@/lib/ai-first-search-vision";
import type { AgentFlowPhase } from "@/lib/agent-flow-phase";
import { useFlowUiSkin } from "@/hooks/useFlowUiSkin";
import { sanitizeAgentReplyForDisplay } from "@/lib/agent-reply-display";

const GEMINI_BLUE = "#1167b1";

export type AiCommandBarPlacement = "hero" | "inline" | "dock" | "wizard";

export interface AiCommandBarProps {
  placement?: AiCommandBarPlacement;
  phase?: AgentFlowPhase;
  seedQuery?: string | null;
  onSeedConsumed?: () => void;
  className?: string;
}

/**
 * P9 — unified AI Command Bar: hero search, inline search, and fixed bottom dock.
 */
export function AiCommandBar({
  placement = "inline",
  phase = "idle",
  seedQuery,
  onSeedConsumed,
  className,
}: AiCommandBarProps) {
  const isDock = placement === "dock" || placement === "wizard";
  const isHero = placement === "hero";

  const {
    requestMediaConsent,
    setSearchInputMode,
    applyVisualSearch,
    clearVisualSearch,
    showToast,
    user,
    chameleonTheme,
    listings,
    startListingFromQuery,
  } = useVauto();
  const { sellerStep } = useSellerFlow();
  const {
    searchQuery,
    setSearchQuery,
    setSearchLoading,
    searchLoading,
    setAgentPinnedListings,
    setViewMode,
    marketplaceFilters,
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
  const inputRef = useRef<HTMLInputElement>(null);

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
        await sendAgentMessage(msg);
        return;
      }
      void commitSearch(draftQuery);
      inputRef.current?.blur();
    },
    [placement, phase, draftQuery, agentBusy, sendAgentMessage, commitSearch]
  );

  const handlePhotoSearch = () => {
    if (isPhotoSearching || photoFlowOpen) return;
    requestMediaConsent(() => setPhotoFlowOpen(true));
  };

  const handlePhotoFlowSubmit = async (
    result: AiPhotoFlowResult
  ): Promise<boolean> => {
    setIsPhotoSearching(true);
    await persistPhotoSearchSession(
      { dataUrl: result.photos[0]!, fileName: result.fileName },
      result.extraContext
    );
    try {
      const vision = await runPhotoVisionSearch(result.photos[0]!, {
        extraContext: result.extraContext || undefined,
        userCity: user.city,
        userName: user.name,
        wardrobeOnly: wardrobeSearchOnly,
      });

      if (!vision || (!vision.keywords.trim() && !vision.intent.semanticAlternatives?.length)) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return false;
      }

      if (vision.confidence < 0.35 && !vision.intent.semanticAlternatives?.length) {
        showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
        return false;
      }

      const searchChips = vision.intent.choiceChips?.filter(Boolean) ?? [];
      const sellChips = searchChips.filter((c) => /^parduoti/i.test(c.trim()));
      if (sellChips.length >= 2) {
        openWithGreeting(
          vision.intent.clarificationPrompt ||
            "Nuotraukoje matau kelis objektus. Ką norite parduoti?",
          { quickReplies: sellChips }
        );
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }
      if (searchChips.length >= 2) {
        openWithGreeting(
          vision.intent.clarificationPrompt ||
            "Nuotraukoje matau kelis objektus. Ką norite ieškoti?",
          { quickReplies: searchChips }
        );
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      if (wardrobeSearchOnly) {
        const photoUrls = result.photos?.filter(Boolean).slice(0, 6) ?? [];
        setSearchLoading(true);
        void sendAgentMessage(
          "Nufotografavau drabužius — paruošk atskirus skelbimus.",
          {
            fromSearchBar: true,
            pendingImageUrls: photoUrls,
          }
        )
          .then((res) => {
            if (res.actions) syncGridFromAgentActions(res.actions);
          })
          .finally(() => setSearchLoading(false));
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      if (result.extraContext?.trim()) {
        setSearchInputMode("photo");
        setDraftQuery(result.extraContext.trim());
        setSearchLoading(true);
        void sendAgentMessage(result.extraContext.trim(), {
          fromSearchBar: true,
          pendingImageUrls: result.photos?.filter(Boolean).slice(0, 6),
        })
          .then((res) => {
            if (res.actions) syncGridFromAgentActions(res.actions);
          })
          .finally(() => setSearchLoading(false));
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      const grid = applyVisualPhotoSearchToGrid(
        vision,
        listings,
        marketplaceFilters,
        user.name,
        wardrobeSearchOnly
      );

      const itemLabel = vision.title ?? grid.searchQuery;
      setSearchInputMode("photo");

      if (grid.listingIds.length === 0) {
        const altChips = formatSearchAlternativeChips(
          vision.intent.semanticAlternatives ?? []
        );
        setDraftQuery(itemLabel);
        notifyAgentFlow({
          kind: "photo_search_applied",
          objectLabel: itemLabel,
          resultCount: 0,
        });
        if (altChips.length >= 2) {
          openWithGreeting(
            `Tikslaus „${itemLabel}" neradau. Pabandykime artimiausius variantus:`,
            { quickReplies: altChips }
          );
          showToast("Pasiūliau panašius variantus — pasirinkite žemiau.", "info");
        } else {
          void sendAgentMessage(
            `Nuotraukoje matau: ${itemLabel}. Šio daikto turguje neradau — ar norite jį įdėti pardavimui?`,
            { pendingImageUrls: result.photos?.filter(Boolean).slice(0, 6) }
          );
          showToast(
            "Tokio skelbimo neradome. Galiu padėti sukurti juodraštį pardavimui.",
            "info"
          );
        }
        clearPhotoSearchSession();
        setPhotoFlowOpen(false);
        return true;
      }

      const action = buildVisionSearchAgentAction(vision, grid.listingIds, {
        wardrobeOnly: wardrobeSearchOnly,
        label: grid.secretaryComment,
      });
      syncGridFromAgentActions(action);

      notifyAgentFlow({
        kind: "photo_search_applied",
        objectLabel: itemLabel,
        resultCount: grid.listingIds.length,
      });

      setDraftQuery(grid.searchQuery);
      setSearchQuery(grid.searchQuery);

      void applyVisualSearch(
        buildVisualSearchProfile(
          {
            title: vision.title ?? grid.searchQuery,
            price: 0,
            location: grid.intent.cityNominative || user.city || "Lietuva",
            contact: user.phone || "+370 612 34567",
            category: (vision.category as ListingCategory) ?? "other",
            confidence: vision.confidence,
            attributes: grid.intent.searchFilters as Record<string, string>,
          },
          "photo",
          result.photos[0]
        )
      );

      showToast(grid.secretaryComment, "success");
      scrollToResults();
      clearPhotoSearchSession();
      setPhotoFlowOpen(false);
      return true;
    } catch {
      showToast(PHOTO_SEARCH_FALLBACK_MESSAGE, "info");
      return false;
    } finally {
      setIsPhotoSearching(false);
    }
  };

  const lastAssistant = useMemo(() => {
    const m = [...messages].reverse().find((x) => x.role === "assistant");
    if (!m?.text) return "";
    return sanitizeAgentReplyForDisplay(m.text) || m.text;
  }, [messages]);

  const dockPlaceholder =
    phase === "listing_processing"
      ? "Agentas apdoroja — galite rašyti patikslinimus…"
      : placement === "wizard"
        ? skin.variant === "spinta"
          ? "Rašykite Spintos sekretorei — pvz. „pakeisk dydį į M“"
          : "Rašykite — pvz. „pakeisk kainą“ arba „pridėk defektus“"
        : AI_FIRST_SEARCH_PLACEHOLDER;

  const inputPlaceholder = isDock
    ? dockPlaceholder
    : isHero
      ? AI_FIRST_SEARCH_PLACEHOLDER
      : "Rašykite paiešką arba įkelkite nuotrauką…";

  const busy = agentBusy || searchLoading || isPhotoSearching;
  const showAssistantBubble =
    isDock &&
    lastAssistant &&
    (placement === "wizard" || phase === "idle" || phase === "agent_chat");

  const dockFormClass = cn(
    "pointer-events-auto flex items-center gap-2 rounded-2xl border p-1.5 pl-3.5 shadow-lg backdrop-blur-xl",
    placement === "wizard" ? skin.composerBorder : "border-[var(--vauto-border)]",
    placement === "wizard" ? skin.composerBg : "bg-[var(--vauto-card-bg)]"
  );

  const dockInputClass =
    "min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-main)] outline-none placeholder:text-[var(--vauto-text-muted)]";

  const dockButtonClass =
    placement === "wizard"
      ? cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40",
          skin.composerButton
        )
      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)] transition disabled:opacity-40";

  if (isDock) {
    return (
      <>
        <div
          className={cn(
            "ai-command-dock pointer-events-none fixed inset-x-0 bottom-0 z-40",
            "pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
            className
          )}
          aria-label="VAUTO AI komandų juosta"
        >
          <div className="mx-auto max-w-lg px-3">
            {showAssistantBubble && (
              <p
                className={cn(
                  "pointer-events-auto mb-1.5 line-clamp-2 rounded-xl border px-3 py-2 text-[11px] leading-snug shadow-md backdrop-blur-md",
                  placement === "wizard"
                    ? cn(skin.composerBorder, skin.composerBg)
                    : "border-[var(--vauto-border)] bg-[var(--vauto-card-bg)]",
                  "text-[var(--vauto-text-muted)]"
                )}
              >
                <Sparkles
                  className={cn(
                    "mr-1 inline h-3 w-3",
                    placement === "wizard"
                      ? skin.composerAccentIcon
                      : "text-[var(--vauto-primary)]"
                  )}
                  aria-hidden
                />
                {lastAssistant.slice(0, 180)}
                {lastAssistant.length > 180 ? "…" : ""}
              </p>
            )}
            <form onSubmit={(e) => void handleSubmit(e)} className={dockFormClass}>
              <input
                ref={inputRef}
                type="text"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={phase === "listing_processing" && agentBusy}
                className={dockInputClass}
                enterKeyHint={placement === "wizard" ? "send" : "search"}
                aria-label="VAUTO AI komanda"
              />
              {placement === "dock" && (
                <button
                  type="button"
                  onClick={handlePhotoSearch}
                  disabled={isPhotoSearching || photoFlowOpen}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--vauto-primary)] transition hover:bg-[var(--vauto-bg)] disabled:opacity-40"
                  aria-label="Vision AI paieška pagal nuotrauką"
                >
                  {isPhotoSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={!draftQuery.trim() || busy}
                className={dockButtonClass}
                aria-label={placement === "wizard" ? "Siųsti žinutę" : "Ieškoti"}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : placement === "wizard" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>
        {placement === "dock" && (
          <AiPhotoFlowSheet
            open={photoFlowOpen}
            mode="search"
            busy={isPhotoSearching}
            onClose={() => setPhotoFlowOpen(false)}
            onSubmit={handlePhotoFlowSubmit}
          />
        )}
      </>
    );
  }

  return (
    <>
      <form
        className={cn(
          "flex items-center gap-2 border shadow-sm transition-colors",
          isHero
            ? "home-ai-hero-search rounded-[1.35rem] py-2.5 pl-4 pr-2"
            : "vauto-surface-panel rounded-xl py-1.5 pl-3.5 pr-1.5",
          zeroUiActive && "zero-ui-search-active",
          className
        )}
        style={{ borderColor: isHero ? "var(--vauto-border)" : ui.searchBorder }}
        onSubmit={(e) => void handleSubmit(e)}
        role="search"
        aria-label="Skelbimų paieška"
      >
        <Sparkles
          className={cn(
            "shrink-0 transition-opacity",
            isHero ? "h-5 w-5" : "h-4 w-4",
            agentBusy && "zero-ui-icon-pulse"
          )}
          style={{ color: isHero ? "var(--vauto-primary)" : GEMINI_BLUE }}
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
            "min-w-0 flex-1 border-none bg-transparent outline-none",
            isHero
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
            isHero ? "h-11 w-11" : "h-10 w-10 rounded-lg"
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

      {!isHero && (
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
        mode="search"
        busy={isPhotoSearching}
        onClose={() => setPhotoFlowOpen(false)}
        onSubmit={handlePhotoFlowSubmit}
      />
    </>
  );
}

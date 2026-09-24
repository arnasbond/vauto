"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { apiFetchUserNudges } from "@/lib/api/user-intelligence";
import { isDataApiEnabled } from "@/lib/api/config";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";
import {
  buildBargainingInterventionMessage,
  buildNoMatchInterventionMessage,
} from "@/lib/offer-engine-client";
import type { MarketplaceFilterState } from "@/lib/marketplace-view";
import { shouldSuppressBuyerProactiveNudges } from "@/lib/seller-chat-session";
import { isLiveInterventionAllowed } from "@/lib/agent-action-guard";

function toAgentFilters(state: MarketplaceFilterState, searchQuery: string): AgentSearchFilters {
  return {
    query: searchQuery.trim() || undefined,
    category: state.category !== "all" ? state.category : undefined,
    city: state.location.trim() || undefined,
    maxPrice: state.priceMax ?? undefined,
    minPrice: state.priceMin ?? undefined,
    radiusKm: state.radiusKm ?? undefined,
    condition: state.condition !== "all" ? state.condition : undefined,
    categoryAttributes: state.categoryAttributes,
  };
}

/** Global AI live interventions — proactive Offer Engine (no-match leads + bargaining). */
export function LiveInterventionHost() {
  const pathname = usePathname();
  const {
    searchQuery,
    searchLoading,
    chameleonTheme,
    marketplaceFilters,
    user,
    isAuthenticated,
    sellerAnalytics,
    buyerIntentCount,
  } = useVauto();
  const { agentPinnedListingIds } = useVautoSearch();
  const { open, openWithGreeting, busy: agentBusy, sendAgentMessage } = useVautoAgent();
  const { events, shouldFireIntervention } = useUserBehavior();
  const lastHandledEventId = useRef<string | null>(null);
  const noMatchTriggeredRef = useRef<string | null>(null);
  const proBusinessNudgeRef = useRef(false);
  const dbNudgeHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isDataApiEnabled()) return;
    if (!isLiveInterventionAllowed({ agentBusy, agentPinnedListingIds, chatOpen: open, interventionKind: "user_nudge" })) return;
    // Fresh AI Seller listing session — never inject sticky buyer „Jūsų noras…“ nudges.
    if (shouldSuppressBuyerProactiveNudges()) return;
    void (async () => {
      if (shouldSuppressBuyerProactiveNudges()) return;
      const res = await apiFetchUserNudges();
      if (!res.ok || !res.data?.nudges?.length) return;
      if (shouldSuppressBuyerProactiveNudges()) return;
      const nudge = res.data.nudges[0]!;
      if (dbNudgeHandledRef.current === nudge.key) return;
      if (!shouldFireIntervention(nudge.key)) return;
      // Requirement / search-wish nudges stay suppressed during sell flows.
      if (/^requirement:|^new_matches:/i.test(nudge.key) && shouldSuppressBuyerProactiveNudges()) {
        return;
      }
      dbNudgeHandledRef.current = nudge.key;
      openWithGreeting(nudge.message, {
        quickReplies: nudge.quickReplies,
        openSheet: true,
      });
    })();
  }, [isAuthenticated, open, agentBusy, agentPinnedListingIds, shouldFireIntervention, openWithGreeting]);

  const wardrobeMode =
    chameleonTheme === "wardrobe" ||
    pathname === "/fashion" ||
    pathname === "/fashion/";

  const triggerNoMatchOffer = useCallback(
    (query: string, key: string) => {
      // Core v2 Single Authority: Proactive client-side no_match assistant messages are suppressed.
      if (
        !isLiveInterventionAllowed({
          agentBusy,
          agentPinnedListingIds,
          chatOpen: open,
          interventionKind: "no_match",
        })
      ) {
        return;
      }
      if (!shouldFireIntervention(key)) return;
      noMatchTriggeredRef.current = key;
      const greeting = buildNoMatchInterventionMessage(query, wardrobeMode);
      openWithGreeting(greeting);
      void sendAgentMessage(greeting, {
        skipBusyCheck: true,
        proactiveTriggerOnly: true,
        proactiveOffer: {
          kind: "no_match",
          query,
          wardrobeMode,
          filters: toAgentFilters(marketplaceFilters, query),
        },
      });
    },
    [
      agentBusy,
      agentPinnedListingIds,
      open,
      wardrobeMode,
      shouldFireIntervention,
      openWithGreeting,
      sendAgentMessage,
      marketplaceFilters,
    ]
  );

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last || last.id === lastHandledEventId.current) return;

    if (last.type === "seller_photo_category_mismatch") {
      lastHandledEventId.current = last.id;
      return;
    }

    if (last.type === "search_empty") {
      lastHandledEventId.current = last.id;
      // Single Authority invariant: Core v2 owns zero-result reasoning & retrieval.
      // Raw client search_empty cannot generate competing assistant messages.
      if (
        !isLiveInterventionAllowed({
          agentBusy,
          agentPinnedListingIds,
          chatOpen: open,
          interventionKind: "no_match",
        })
      ) {
        return;
      }
      const query = String(last.payload.query ?? searchQuery).trim();
      if (!query) return;
      const key = `empty:${query}`;
      triggerNoMatchOffer(query, key);
      return;
    }

    if (last.type === "listing_dwell" && wardrobeMode) {
      if (
        !isLiveInterventionAllowed({
          agentBusy,
          agentPinnedListingIds,
          chatOpen: open,
          interventionKind: "bargaining",
        })
      ) {
        return;
      }
      const listingId = String(last.payload.listingId ?? "");
      const title = String(last.payload.title ?? "Prekė");
      const price = Number(last.payload.price) || 0;
      if (!listingId || price <= 0) return;
      const key = `dwell:${listingId}`;
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      const greeting = buildBargainingInterventionMessage(title, price, true);
      openWithGreeting(greeting);
      void sendAgentMessage(greeting, {
        skipBusyCheck: true,
        proactiveTriggerOnly: true,
        proactiveOffer: {
          kind: "bargaining",
          listingId,
          listingTitle: title,
          listingPrice: price,
          category: String(last.payload.category ?? "clothing"),
          wardrobeMode: true,
        },
      });
      return;
    }

    if (last.type === "negotiate_click") {
      if (
        !isLiveInterventionAllowed({
          agentBusy,
          agentPinnedListingIds,
          chatOpen: open,
          interventionKind: "bargaining",
        })
      ) {
        return;
      }
      const listingId = String(last.payload.listingId ?? "");
      const title = String(last.payload.title ?? "Prekė");
      const price = Number(last.payload.price) || 0;
      if (!listingId || price <= 0) return;
      const key = `negotiate:${listingId}`;
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      const greeting = buildBargainingInterventionMessage(title, price, wardrobeMode);
      openWithGreeting(greeting);
      void sendAgentMessage(greeting, {
        skipBusyCheck: true,
        proactiveTriggerOnly: true,
        proactiveOffer: {
          kind: "bargaining",
          listingId,
          listingTitle: title,
          listingPrice: price,
          category: String(last.payload.category ?? ""),
          wardrobeMode,
        },
      });
      return;
    }
  }, [
    events,
    open,
    agentBusy,
    agentPinnedListingIds,
    searchLoading,
    searchQuery,
    wardrobeMode,
    openWithGreeting,
    sendAgentMessage,
    shouldFireIntervention,
    triggerNoMatchOffer,
    isAuthenticated,
  ]);

  useEffect(() => {
    if (
      !isLiveInterventionAllowed({
        agentBusy,
        agentPinnedListingIds,
        chatOpen: open,
        interventionKind: "business_nudge",
      })
    ) {
      return;
    }
    if (proBusinessNudgeRef.current) return;
    if (user.role !== "pro" && user.role !== "admin") return;
    const onProfile =
      pathname === "/profile" || pathname?.startsWith("/profile/");
    if (!onProfile) return;

    const lowVisibility = sellerAnalytics.views < 12;
    const hasBuyerIntent = buyerIntentCount > 0;
    if (!lowVisibility && !hasBuyerIntent) return;

    const key = "pro_business_nudge";
    if (!shouldFireIntervention(key)) return;
    proBusinessNudgeRef.current = true;

    const firstName = user.name.split(/\s+/)[0] || "drauge";
    notifyAgentFlow({
      kind: "business_dashboard_nudge",
      region: user.city || undefined,
      viewsLow: lowVisibility,
      buyerIntentCount: hasBuyerIntent ? buyerIntentCount : undefined,
      firstName,
    });
    void sendAgentMessage("Parodyk mano verslo apžvalgą ir statistiką", {
      skipBusyCheck: true,
    });
  }, [
    open,
    agentBusy,
    agentPinnedListingIds,
    pathname,
    user.role,
    user.name,
    user.city,
    sellerAnalytics.views,
    buyerIntentCount,
    shouldFireIntervention,
    openWithGreeting,
    sendAgentMessage,
  ]);

  return null;
}

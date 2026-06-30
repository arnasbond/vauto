"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import { AGENT_MIN_QUERY_CHARS } from "@/lib/vauto-agent-client";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";
import {
  buildBargainingInterventionMessage,
  buildNoMatchInterventionMessage,
} from "@/lib/offer-engine-client";
import {
  buildSellerPhotoCategoryMismatchMessage,
  sellerPhotoCategoryMismatchQuickReplies,
} from "@/lib/seller-photo-category-mismatch";
import type { MarketplaceFilterState } from "@/lib/marketplace-view";
import type { ListingCategory } from "@/lib/types";

const EMPTY_WARDROBE_GREETING =
  "Matau, kad tavo spinta dar tuščia! Jei turi nereikalingų drabužių ar technikos — tiesiog nufotografuok, ir aš paruošiu skelbimą per 5 sekundes.";

function buildWardrobeShortQueryIntervention(query: string): string {
  return `Matau, kad ieškai kažko specifinio tavo spintoje („${query}"). Leisk man padėti — pasakyk dydį, spalvą ar prekės tipą, ir aš surasiu tau tinkamiausią variantą!`;
}

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
    rankedListings,
    searchLoading,
    chameleonTheme,
    marketplaceFilters,
    listings,
    user,
    isAuthenticated,
    sellerAnalytics,
    buyerIntentCount,
  } = useVauto();
  const { open, openWithGreeting, busy: agentBusy, sendAgentMessage } = useVautoAgent();
  const { events, shouldFireIntervention } = useUserBehavior();
  const lastHandledEventId = useRef<string | null>(null);
  const noMatchTriggeredRef = useRef<string | null>(null);
  const emptyWardrobeTriggeredRef = useRef(false);
  const proBusinessNudgeRef = useRef(false);

  const myClothingCount = listings.filter(
    (l) => l.sellerId === user.id && l.category === "clothing" && l.status !== "sold"
  ).length;

  const wardrobeMode =
    chameleonTheme === "wardrobe" ||
    pathname === "/fashion" ||
    pathname === "/fashion/";

  const triggerNoMatchOffer = useCallback(
    (query: string, key: string) => {
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
      wardrobeMode,
      shouldFireIntervention,
      openWithGreeting,
      sendAgentMessage,
      marketplaceFilters,
    ]
  );

  useEffect(() => {
    if (open || agentBusy || searchLoading) return;

    const last = events[events.length - 1];
    if (!last || last.id === lastHandledEventId.current) return;

    if (last.type === "seller_photo_category_mismatch") {
      const fromCategory = String(last.payload.fromCategory ?? "") as ListingCategory;
      const toCategory = String(last.payload.toCategory ?? "") as ListingCategory;
      if (!fromCategory || !toCategory) return;
      const key = `photo_mismatch:${fromCategory}:${toCategory}`;
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      const greeting = buildSellerPhotoCategoryMismatchMessage(fromCategory, toCategory);
      const quickReplies = sellerPhotoCategoryMismatchQuickReplies(fromCategory);
      openWithGreeting(greeting, { quickReplies, openSheet: true });
      void sendAgentMessage(greeting, {
        skipBusyCheck: true,
        proactiveTriggerOnly: true,
      });
      return;
    }

    if (last.type === "search_empty") {
      const query = String(last.payload.query ?? searchQuery).trim();
      if (!query) return;
      const key = `empty:${query}`;
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      triggerNoMatchOffer(query, key);
      return;
    }

    if (last.type === "listing_dwell" && wardrobeMode) {
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

    if (last.type === "search_submit" && last.payload.wardrobeMode) {
      const query = String(last.payload.query ?? "").trim();
      const len = query.length;
      if (len >= AGENT_MIN_QUERY_CHARS && len < 12) {
        const key = `wardrobe_short:${query}`;
        if (!shouldFireIntervention(key)) return;
        lastHandledEventId.current = last.id;
        openWithGreeting(buildWardrobeShortQueryIntervention(query));
      }
      return;
    }

    if (
      (last.type === "spinta_enter" || wardrobeMode) &&
      isAuthenticated &&
      myClothingCount === 0 &&
      !emptyWardrobeTriggeredRef.current
    ) {
      const key = "empty_wardrobe";
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      emptyWardrobeTriggeredRef.current = true;
      openWithGreeting(EMPTY_WARDROBE_GREETING);
      void sendAgentMessage(EMPTY_WARDROBE_GREETING, {
        skipBusyCheck: true,
        proactiveTriggerOnly: true,
        proactiveOffer: {
          kind: "no_match",
          query: "spinta",
          wardrobeMode: true,
        },
      });
      return;
    }
  }, [
    events,
    open,
    agentBusy,
    searchLoading,
    searchQuery,
    wardrobeMode,
    openWithGreeting,
    sendAgentMessage,
    shouldFireIntervention,
    triggerNoMatchOffer,
    isAuthenticated,
    myClothingCount,
  ]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || searchLoading || agentBusy || open) return;
    if (rankedListings.length > 0) return;

    const key = `grid_empty:${q}`;
    if (noMatchTriggeredRef.current === key) return;
    triggerNoMatchOffer(q, key);
  }, [
    searchQuery,
    rankedListings.length,
    searchLoading,
    agentBusy,
    open,
    triggerNoMatchOffer,
  ]);

  useEffect(() => {
    if (open || agentBusy) return;
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

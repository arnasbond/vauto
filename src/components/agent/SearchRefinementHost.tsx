"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoSearch } from "@/context/VautoSearchContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { agentHasSupervisorReply } from "@/lib/agent-chat-layout";
import { evaluateSearchRefinement } from "@/lib/ai-first-search-vision";
import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import type { MarketplaceFilterState } from "@/lib/marketplace-view";

const REFINEMENT_COOLDOWN_MS = 45_000;

function toAgentFilters(state: MarketplaceFilterState, query: string): AgentSearchFilters {
  return {
    query: query.trim() || undefined,
    category: state.category !== "all" ? state.category : undefined,
    city: state.location.trim() || undefined,
    maxPrice: state.priceMax ?? undefined,
    minPrice: state.priceMin ?? undefined,
  };
}

/**
 * P7c foundation — proactive search refinement when results are empty or overwhelming.
 * Complements LiveInterventionHost; uses same agent greeting pipeline.
 */
export function SearchRefinementHost() {
  const pathname = usePathname();
  const { rankedListings } = useVauto();
  const { sellerStep } = useSellerFlow();
  const { searchQuery, searchLoading, marketplaceFilters } = useVautoSearch();
  const { openWithGreeting, busy: agentBusy, sendAgentMessage, messages } = useVautoAgent();
  const { shouldFireIntervention } = useUserBehavior();
  const lastFiredRef = useRef<{ key: string; at: number } | null>(null);

  const wardrobeMode =
    pathname === "/fashion" ||
    pathname === "/fashion/" ||
    pathname.startsWith("/fashion/");

  useEffect(() => {
    if (sellerStep !== "idle") return;
    if (agentBusy || searchLoading) return;
    if (agentHasSupervisorReply(messages)) return;

    const q = searchQuery.trim();
    if (!q || q.length < 4) return;

    const count = rankedListings.length;
    const plan = evaluateSearchRefinement({
      query: q,
      resultCount: count,
      wardrobeMode,
    });

    if (plan.kind === "none" || !plan.proactiveMessage) return;

    const key = `${plan.kind}:${q}:${count}`;
    if (!shouldFireIntervention(key)) return;

    const now = Date.now();
    if (
      lastFiredRef.current?.key === key &&
      now - lastFiredRef.current.at < REFINEMENT_COOLDOWN_MS
    ) {
      return;
    }
    lastFiredRef.current = { key, at: now };

    openWithGreeting(plan.proactiveMessage, { quickReplies: plan.quickReplies });
    void sendAgentMessage(plan.proactiveMessage, {
      skipBusyCheck: true,
      proactiveTriggerOnly: true,
      proactiveOffer: {
        kind: plan.kind === "too_many" ? "search_refine" : "no_match",
        query: q,
        wardrobeMode,
        resultCount: count,
        filters: toAgentFilters(marketplaceFilters, q),
      },
    });
  }, [
    searchQuery,
    rankedListings.length,
    searchLoading,
    agentBusy,
    sellerStep,
    wardrobeMode,
    shouldFireIntervention,
    openWithGreeting,
    sendAgentMessage,
    marketplaceFilters,
    messages,
  ]);

  return null;
}

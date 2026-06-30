"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import {
  evaluateSearchRefinement,
} from "@/lib/ai-first-search-vision";

const REFINEMENT_COOLDOWN_MS = 45_000;

/**
 * P7c foundation — proactive search refinement when results are empty or overwhelming.
 * Complements LiveInterventionHost; uses same agent greeting pipeline.
 */
export function SearchRefinementHost() {
  const pathname = usePathname();
  const { searchQuery, rankedListings, searchLoading, sellerStep } = useVauto();
  const { openWithGreeting, busy: agentBusy, sendAgentMessage } = useVautoAgent();
  const { shouldFireIntervention } = useUserBehavior();
  const lastFiredRef = useRef<{ key: string; at: number } | null>(null);

  const wardrobeMode =
    pathname === "/fashion" ||
    pathname === "/fashion/" ||
    pathname.startsWith("/fashion/");

  useEffect(() => {
    if (sellerStep !== "idle") return;
    if (agentBusy || searchLoading) return;

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
  ]);

  return null;
}

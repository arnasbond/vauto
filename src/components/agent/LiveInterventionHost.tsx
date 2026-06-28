"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useUserBehavior } from "@/context/UserBehaviorContext";
import { AGENT_MIN_QUERY_CHARS } from "@/lib/vauto-agent-client";

function buildEmptySearchIntervention(query: string, wardrobeMode: boolean): string {
  if (wardrobeMode) {
    return `Matau, kad ieškai kažko specifinio Jolantos spintoje pagal „${query}“, bet kol kas tuščia. Leisk man padėti surasti fone — pasakyk spalvą, dydį ar stilių!`;
  }
  return `Matau, kad pagal „${query}“ kol kas nieko neradome. Galiu padėti susiaurinti paiešką ar užfiksuoti norą — pasakyk, ko tiksliai ieškai!`;
}

function buildWardrobeShortQueryIntervention(query: string): string {
  return `Matau, kad ieškai kažko specifinio Jolantos spintoje („${query}“). Leisk man padėti — pasakyk dydį, spalvą ar prekės tipą, ir aš surasiu tau tinkamiausią variantą!`;
}

/**
 * Global AI live interventions — proactive agent bubble when behavior signals need help.
 */
export function LiveInterventionHost() {
  const pathname = usePathname();
  const { searchQuery, rankedListings, searchLoading, chameleonTheme } = useVauto();
  const { open, openWithGreeting, busy: agentBusy } = useVautoAgent();
  const { events, shouldFireIntervention } = useUserBehavior();
  const lastHandledEventId = useRef<string | null>(null);

  const wardrobeMode =
    chameleonTheme === "wardrobe" ||
    pathname === "/fashion" ||
    pathname === "/fashion/";

  useEffect(() => {
    if (open || agentBusy || searchLoading) return;

    const last = events[events.length - 1];
    if (!last || last.id === lastHandledEventId.current) return;

    if (last.type === "search_empty") {
      const query = String(last.payload.query ?? searchQuery).trim();
      if (!query) return;
      const key = `empty:${query}`;
      if (!shouldFireIntervention(key)) return;
      lastHandledEventId.current = last.id;
      openWithGreeting(buildEmptySearchIntervention(query, wardrobeMode));
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
    }
  }, [
    events,
    open,
    agentBusy,
    searchLoading,
    searchQuery,
    wardrobeMode,
    openWithGreeting,
    shouldFireIntervention,
  ]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || searchLoading || agentBusy || open) return;
    if (rankedListings.length > 0) return;

    const key = `grid_empty:${q}`;
    if (!shouldFireIntervention(key)) return;
    openWithGreeting(buildEmptySearchIntervention(q, wardrobeMode));
  }, [
    searchQuery,
    rankedListings.length,
    searchLoading,
    agentBusy,
    open,
    wardrobeMode,
    openWithGreeting,
    shouldFireIntervention,
  ]);

  return null;
}

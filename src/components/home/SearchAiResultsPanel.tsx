"use client";

import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarketplaceGridCard } from "@/components/marketplace/MarketplaceListingCards";
import { useVauto } from "@/context/VautoContext";
import { getPortalUi } from "@/lib/chameleon-portal-ui";
import { portalExperienceForQuery } from "@/lib/portal-experience";
import {
  formatInsightAsMessage,
  generateSearchBuyerInsight,
  type SearchBuyerInsight,
} from "@/lib/search-buyer-insight";
import { sanitizeSearchQuery } from "@/lib/portal-listing-filter";
import { cn } from "@/lib/cn";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

function InsightBlock({
  insight,
  loading,
}: {
  insight: SearchBuyerInsight | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-4 py-4 text-sm text-[var(--vauto-text-muted)]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--vauto-primary)]" />
        Gemini AI analizuoja rinką…
      </div>
    );
  }

  if (!insight) return null;

  return (
    <div className="rounded-2xl border border-[var(--vauto-primary)]/25 bg-gradient-to-br from-[var(--vauto-primary)]/8 to-[var(--flux-indigo)]/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--vauto-primary)]" aria-hidden />
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--vauto-primary)]">
          VAUTO AI įžvalga
        </p>
      </div>
      <p className="text-sm leading-relaxed text-[var(--vauto-text-main)]">
        {insight.summary}
      </p>
      {insight.budgetNote ? (
        <p className="mt-2 text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          {insight.budgetNote}
        </p>
      ) : null}
      {insight.equipmentTips.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Rekomenduojama komplektacija
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {insight.equipmentTips.map((tip) => (
              <li
                key={tip}
                className="rounded-full border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] px-2.5 py-1 text-[11px] text-[var(--vauto-text-main)]"
              >
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
      {insight.technicalTips.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
            Į ką atkreipti dėmesį
          </p>
          <ul className="mt-1.5 space-y-1">
            {insight.technicalTips.map((tip) => (
              <li
                key={tip}
                className="flex gap-2 text-xs leading-relaxed text-[var(--vauto-text-muted)]"
              >
                <span className="text-[var(--vauto-accent)]">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TopPicksRow({ listings }: { listings: ReturnType<typeof useVauto>["rankedListings"] }) {
  const { searchQuery } = useVauto();
  const ui = getPortalUi(portalExperienceForQuery(searchQuery).theme);
  const top = listings.slice(0, 5);

  if (top.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold text-[var(--vauto-text-main)]">
          {top.length >= 5 ? "Mano TOP 5" : "Šiuo metu Lietuvoje siūlomi variantai"}
        </h3>
        <Link
          href="#listing-results"
          className="text-xs font-semibold text-[var(--vauto-primary)] hover:underline"
        >
          Visi rezultatai
        </Link>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 px-1 snap-x snap-mandatory">
        {top.map((listing) => (
          <div key={listing.id} className="w-[148px] shrink-0 snap-start">
            <MarketplaceGridCard listing={listing} priceColor={ui.price} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SearchAiResultsPanelProps {
  onFollowUp?: (query: string) => void;
}

export function SearchAiResultsPanel({ onFollowUp }: SearchAiResultsPanelProps) {
  const { searchQuery, rankedListings, searchLoading, user } = useVauto();
  const query = searchQuery.trim();
  const [insight, setInsight] = useState<SearchBuyerInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const lastInsightKeyRef = useRef("");

  useEffect(() => {
    if (query.length < 3) {
      setInsight(null);
      setChatTurns([]);
      return;
    }

    const key = `${query}|${rankedListings.slice(0, 5).map((l) => l.id).join(",")}`;
    if (searchLoading) return;
    if (key === lastInsightKeyRef.current) return;

    let cancelled = false;
    setInsightLoading(true);

    void generateSearchBuyerInsight(query, rankedListings, user.city).then((result) => {
      if (cancelled) return;
      setInsight(result);
      setInsightLoading(false);
      lastInsightKeyRef.current = key;

      setChatTurns((prev) => {
        const hasUser = prev.some((t) => t.role === "user" && t.text === query);
        const next: ChatTurn[] = hasUser
          ? prev
          : [...prev, { role: "user", text: query }];
        const assistantText = formatInsightAsMessage(result);
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.text === assistantText) return next;
        return [...next.filter((t) => !(t.role === "assistant" && t.text === assistantText)), { role: "assistant", text: assistantText }];
      });
    });

    return () => {
      cancelled = true;
    };
  }, [query, rankedListings, searchLoading, user.city]);

  const handleFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    const q = sanitizeSearchQuery(followUpDraft, "final");
    if (!q || q.length < 3) return;
    setFollowUpDraft("");
    setChatTurns((prev) => [...prev, { role: "user", text: q }]);
    onFollowUp?.(q);
  };

  if (query.length < 3) return null;

  return (
    <section
      id="search-ai-panel"
      className="mb-6 scroll-mt-24"
      aria-label="AI paieškos analizė"
    >
      <InsightBlock insight={insight} loading={insightLoading || searchLoading} />
      {!searchLoading && rankedListings.length > 0 && (
        <TopPicksRow listings={rankedListings} />
      )}

      {chatTurns.length > 0 && (
        <div className="mt-5 space-y-2">
          {chatTurns.slice(-4).map((turn, i) => (
            <div
              key={`${turn.role}-${i}-${turn.text.slice(0, 24)}`}
              className={cn(
                "max-w-[95%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                turn.role === "user"
                  ? "ml-auto rounded-tr-md bg-[var(--vauto-primary)] text-[var(--vauto-primary-contrast)]"
                  : "rounded-tl-md border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] text-[var(--vauto-text-main)]"
              )}
            >
              {turn.text}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleFollowUp} className="mt-4">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] py-1.5 pl-3.5 pr-1.5 shadow-sm">
          <input
            type="text"
            value={followUpDraft}
            onChange={(e) => setFollowUpDraft(e.target.value)}
            placeholder="Tęskite pokalbį — pvz. „Parodyk tik automatą“"
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-[var(--vauto-text-main)] placeholder:text-[var(--vauto-text-muted)] outline-none"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={followUpDraft.trim().length < 3 || searchLoading}
            className="shrink-0 rounded-xl bg-[var(--vauto-primary)] px-3.5 py-2 text-xs font-bold text-[var(--vauto-primary-contrast)] disabled:opacity-40"
          >
            Siųsti
          </button>
        </div>
      </form>
    </section>
  );
}

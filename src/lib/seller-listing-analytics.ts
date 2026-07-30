import type { ListingMetrics } from "@/lib/listing-analytics";

/** Server aggregate for Pro B2B dashboard (listing_events + promote spend). */
export interface SellerListingAnalytics {
  views: number;
  contacts: number;
  callClicks: number;
  chatStarts: number;
  shareStory: number;
  saves: number;
  interestScore: number;
  promoteSpendEur: number;
  costPerContact: number | null;
  source: "server" | "local";
}

export function emptySellerListingAnalytics(
  source: "server" | "local" = "local"
): SellerListingAnalytics {
  return {
    views: 0,
    contacts: 0,
    callClicks: 0,
    chatStarts: 0,
    shareStory: 0,
    saves: 0,
    interestScore: 0,
    promoteSpendEur: 0,
    costPerContact: null,
    source,
  };
}

export function mergeSellerAnalytics(
  local: ListingMetrics,
  remote: SellerListingAnalytics | null
): SellerListingAnalytics {
  if (!remote || remote.source !== "server") {
    const contacts = local.callClicks + local.chatStarts;
    return {
      views: local.views,
      contacts,
      callClicks: local.callClicks,
      chatStarts: local.chatStarts,
      shareStory: 0,
      saves: local.saves,
      interestScore: local.interestScore,
      promoteSpendEur: 0,
      costPerContact: null,
      source: "local",
    };
  }

  // Prefer server event counters; keep local saves (not in listing_events).
  const views = remote.views;
  const callClicks = remote.callClicks;
  const chatStarts = remote.chatStarts;
  const contacts = remote.contacts > 0 ? remote.contacts : callClicks + chatStarts;
  const saves = Math.max(remote.saves, local.saves);
  const interestScore =
    views > 0
      ? Math.min(99, Math.round((contacts / views) * 100 * 3 + saves * 2))
      : 0;
  const promoteSpendEur = remote.promoteSpendEur;
  const costPerContact =
    contacts > 0 && promoteSpendEur > 0
      ? Math.round((promoteSpendEur / contacts) * 100) / 100
      : null;

  return {
    views,
    contacts,
    callClicks,
    chatStarts,
    shareStory: remote.shareStory,
    saves,
    interestScore,
    promoteSpendEur,
    costPerContact,
    source: "server",
  };
}

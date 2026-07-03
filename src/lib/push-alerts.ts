import type { Listing } from "@/lib/types";
import { listingPath } from "@/lib/seo";
import { isNativePushDisabled } from "@/lib/mobile-install";
import { logWakeEvent } from "@/lib/wake-word-engine";
import { visibilityBoostScore } from "@/lib/visibility-plans";

const ALERT_CHECK_MS = 120_000;

export interface PushAlertPayload {
  title: string;
  body: string;
  url: string;
  listingId: string;
  voiceText?: string;
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.;:!?—–-]+/)
    .filter((t) => t.length >= 3);
}

function listingMatchesQuery(listing: Listing, query: string): boolean {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return false;
  const haystack = [
    listing.title,
    listing.location,
    listing.category,
    ...listing.tags,
    listing.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

function listingScore(listing: Listing): number {
  return (
    (listing.views ?? 0) +
    (listing.callClicks ?? 0) * 3 +
    (listing.saveCount ?? 0) * 2 +
    Math.round(visibilityBoostScore(listing) * 40)
  );
}

export function findHighScoreAlertMatch(
  listings: Listing[],
  savedQueries: string[],
  seenIds: Set<string>
): PushAlertPayload | null {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const queries = savedQueries.filter((q) => q.trim().length >= 3);
  if (!queries.length) return null;

  for (const query of queries) {
    const match = listings
      .filter(
        (l) =>
          !seenIds.has(l.id) &&
          l.status !== "sold" &&
          !l.banned &&
          new Date(l.createdAt).getTime() >= dayAgo &&
          listingMatchesQuery(l, query)
      )
      .sort((a, b) => listingScore(b) - listingScore(a))[0];

    if (match) {
      return {
        title: "VAUTO: pageidavimas įvykdytas!",
        body: `${match.title} — ${match.location}. Atitinka „${query}". Spauskite — atidarysite prekę.`,
        url: listingPath(match),
        listingId: match.id,
        voiceText: `Sveiki! Radau naują skelbimą: ${match.title} ${match.location}.`,
      };
    }
  }
  return null;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isNativePushDisabled()) return "denied";
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export async function postListingsToServiceWorker(
  listings: Listing[],
  savedQueries: string[]
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "VAUTO_SYNC_ALERTS",
    listings: listings.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      location: l.location,
      category: l.category,
      tags: l.tags,
      description: l.description,
      createdAt: l.createdAt,
      status: l.status,
      banned: l.banned,
      views: l.views,
      callClicks: l.callClicks,
      saveCount: l.saveCount,
      promoted: l.promoted,
      score: listingScore(l),
    })),
    savedQueries,
    ts: Date.now(),
  });
  logWakeEvent("sw_sync_posted", { listings: listings.length, queries: savedQueries.length });
}

export function startPushAlertPolling(
  getListings: () => Listing[],
  getQueries: () => string[],
  onAlert: (payload: PushAlertPayload) => void,
  seenIds: Set<string>
): () => void {
  const tick = () => {
    const payload = findHighScoreAlertMatch(getListings(), getQueries(), seenIds);
    if (payload) {
      seenIds.add(payload.listingId);
      onAlert(payload);
    }
    void postListingsToServiceWorker(getListings(), getQueries());
  };

  tick();
  const id = setInterval(tick, ALERT_CHECK_MS);

  // Resilience: after connectivity returns or the tab becomes visible again,
  // catch up immediately instead of waiting up to ALERT_CHECK_MS. This mirrors
  // Messenger-style reconnect — no missed matches linger after a brief outage.
  const onWake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    tick();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onWake);
  }

  return () => {
    clearInterval(id);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onWake);
    }
  };
}

export async function showLocalPushNotification(payload: PushAlertPayload): Promise<void> {
  if (isNativePushDisabled()) return;
  logWakeEvent("push_show", { listingId: payload.listingId, title: payload.title });

  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg?.showNotification) {
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `vauto-alert-${payload.listingId}`,
        renotify: true,
        requireInteraction: true,
        data: { url: payload.url, voiceText: payload.voiceText },
        vibrate: [200, 100, 200],
      } as NotificationOptions);
      return;
    }
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      tag: `vauto-alert-${payload.listingId}`,
    });
  }
}

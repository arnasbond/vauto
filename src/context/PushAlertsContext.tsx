"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { apiFetchAlertQueries, apiSyncAlertQueries } from "@/lib/api/wallet-reviews";
import { speakBuddyMessage } from "@/lib/buddy-voice";
import {
  requestNotificationPermission,
  showLocalPushNotification,
  startPushAlertPolling,
  type PushAlertPayload,
} from "@/lib/push-alerts";
import {
  loadAlertQueries,
  loadPushAlertsEnabled,
  loadPushAlertsSeen,
  saveAlertQueries,
  savePushAlertsEnabled,
  savePushAlertsSeen,
} from "@/lib/storage";
import { registerPushNotifications } from "@/lib/push-registration";
import type { Listing } from "@/lib/types";
import type { SearchIntentEvent } from "@/lib/search-intent";

export interface PushAlertsContextValue {
  pushAlertsEnabled: boolean;
  setPushAlertsEnabled: (enabled: boolean) => void;
  wishlistQueries: string[];
  subscribeWishlist: (query: string) => Promise<boolean>;
  unsubscribeWishlist: (query: string) => void;
  isWishlistSubscribed: (query: string) => boolean;
}

export interface PushAlertsDeps {
  apiActive: boolean;
  catalogHydrated: boolean;
  isAuthenticated: boolean;
  listingsRef: RefObject<Listing[]>;
  onAlertToast: (message: string) => void;
  /** @deprecated kept for type compat — wishlist no longer auto-syncs from search */
  searchQuery?: string;
  searchIntentEvents?: SearchIntentEvent[];
}

const PushAlertsContext = createContext<PushAlertsContextValue | null>(null);

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function PushAlertsProvider({
  deps,
  children,
}: {
  deps: PushAlertsDeps;
  children: ReactNode;
}) {
  const [pushAlertsEnabled, setPushAlertsEnabledState] = useState(true);
  const [wishlistQueries, setWishlistQueries] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const pushAlertsSeenRef = useRef<Set<string>>(new Set());
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const seenPush = loadPushAlertsSeen();
    if (seenPush) pushAlertsSeenRef.current = new Set(seenPush);
    const stored = loadAlertQueries();
    if (stored?.length) setWishlistQueries(stored);
    setPushAlertsEnabledState(loadPushAlertsEnabled());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !deps.apiActive || !deps.isAuthenticated) return;
    void apiFetchAlertQueries().then((res) => {
      if (res.ok && res.data?.queries?.length) {
        setWishlistQueries(res.data.queries);
        saveAlertQueries(res.data.queries);
      }
    });
  }, [hydrated, deps.apiActive, deps.isAuthenticated]);

  const persistWishlist = useCallback(
    (queries: string[]) => {
      const unique = [...new Set(queries.map(normalizeQuery))].filter(
        (s) => s.length >= 3
      );
      setWishlistQueries(unique);
      saveAlertQueries(unique);
      if (depsRef.current.apiActive && depsRef.current.isAuthenticated) {
        void apiSyncAlertQueries(unique);
      }
      return unique;
    },
    []
  );

  const subscribeWishlist = useCallback(
    async (rawQuery: string): Promise<boolean> => {
      const q = normalizeQuery(rawQuery);
      if (q.length < 3) return false;

      if (wishlistQueries.includes(q)) return true;

      const next = persistWishlist([...wishlistQueries, q]);

      const perm = await requestNotificationPermission();
      if (perm === "granted" && depsRef.current.apiActive && depsRef.current.isAuthenticated) {
        await registerPushNotifications(next);
      }

      setPushAlertsEnabledState(true);
      savePushAlertsEnabled(true);
      return true;
    },
    [persistWishlist, wishlistQueries]
  );

  const unsubscribeWishlist = useCallback(
    (rawQuery: string) => {
      const q = normalizeQuery(rawQuery);
      persistWishlist(wishlistQueries.filter((x) => x !== q));
    },
    [persistWishlist, wishlistQueries]
  );

  const isWishlistSubscribed = useCallback(
    (rawQuery: string) => wishlistQueries.includes(normalizeQuery(rawQuery)),
    [wishlistQueries]
  );

  const setPushAlertsEnabled = useCallback(
    (enabled: boolean) => {
      setPushAlertsEnabledState(enabled);
      savePushAlertsEnabled(enabled);
      if (!enabled) return;
      void requestNotificationPermission().then(() => {
        void registerPushNotifications(wishlistQueries);
      });
    },
    [wishlistQueries]
  );

  useEffect(() => {
    if (!hydrated || !deps.catalogHydrated || !pushAlertsEnabled) return;
    if (wishlistQueries.length === 0) return;

    if (deps.apiActive && deps.isAuthenticated) {
      void requestNotificationPermission().then(() => {
        void registerPushNotifications(wishlistQueries);
      });
      return;
    }

    const stopPoll = startPushAlertPolling(
      () => depsRef.current.listingsRef.current ?? [],
      () => wishlistQueries,
      (payload: PushAlertPayload) => {
        pushAlertsSeenRef.current.add(payload.listingId);
        savePushAlertsSeen(Array.from(pushAlertsSeenRef.current));
        void showLocalPushNotification(payload);
        if (payload.voiceText) {
          speakBuddyMessage(payload.voiceText, { enabled: true });
        }
        depsRef.current.onAlertToast(payload.body);
      },
      pushAlertsSeenRef.current
    );

    return stopPoll;
  }, [
    hydrated,
    deps.catalogHydrated,
    pushAlertsEnabled,
    deps.apiActive,
    deps.isAuthenticated,
    wishlistQueries,
  ]);

  const value = useMemo(
    (): PushAlertsContextValue => ({
      pushAlertsEnabled,
      setPushAlertsEnabled,
      wishlistQueries,
      subscribeWishlist,
      unsubscribeWishlist,
      isWishlistSubscribed,
    }),
    [
      pushAlertsEnabled,
      setPushAlertsEnabled,
      wishlistQueries,
      subscribeWishlist,
      unsubscribeWishlist,
      isWishlistSubscribed,
    ]
  );

  return (
    <PushAlertsContext.Provider value={value}>
      {children}
    </PushAlertsContext.Provider>
  );
}

export function usePushAlerts(): PushAlertsContextValue {
  const ctx = useContext(PushAlertsContext);
  if (!ctx) {
    throw new Error("usePushAlerts must be used within PushAlertsProvider");
  }
  return ctx;
}

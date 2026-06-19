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
import { apiSyncAlertQueries } from "@/lib/api/wallet-reviews";
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
import { registerWebPush } from "@/lib/web-push";
import type { Listing } from "@/lib/types";
import type { SearchIntentEvent } from "@/lib/search-intent";

export interface PushAlertsContextValue {
  pushAlertsEnabled: boolean;
  setPushAlertsEnabled: (enabled: boolean) => void;
}

export interface PushAlertsDeps {
  apiActive: boolean;
  catalogHydrated: boolean;
  searchQuery: string;
  searchIntentEvents: SearchIntentEvent[];
  listingsRef: RefObject<Listing[]>;
  onAlertToast: (message: string) => void;
}

const PushAlertsContext = createContext<PushAlertsContextValue | null>(null);

export function PushAlertsProvider({
  deps,
  children,
}: {
  deps: PushAlertsDeps;
  children: ReactNode;
}) {
  const [pushAlertsEnabled, setPushAlertsEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const pushAlertsSeenRef = useRef<Set<string>>(new Set());
  const alertQueriesRef = useRef<string[]>([]);
  const searchQueryRef = useRef(deps.searchQuery);
  searchQueryRef.current = deps.searchQuery;
  const searchIntentRef = useRef(deps.searchIntentEvents);
  searchIntentRef.current = deps.searchIntentEvents;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const seenPush = loadPushAlertsSeen();
    if (seenPush) pushAlertsSeenRef.current = new Set(seenPush);
    const storedAlerts = loadAlertQueries();
    if (storedAlerts) alertQueriesRef.current = storedAlerts;
    setPushAlertsEnabledState(loadPushAlertsEnabled());
    setHydrated(true);
  }, []);

  const buildAlertQueries = useCallback(() => {
    const fromIntent = searchIntentRef.current.slice(0, 8).map((e) => e.query);
    const q = searchQueryRef.current.trim();
    const merged = [
      ...alertQueriesRef.current,
      ...fromIntent,
      ...(q.length >= 3 ? [q] : []),
    ];
    const unique = [...new Set(merged.map((s) => s.trim().toLowerCase()))].filter(
      (s) => s.length >= 3
    );
    alertQueriesRef.current = unique;
    saveAlertQueries(unique);
    return unique;
  }, []);

  const setPushAlertsEnabled = useCallback(
    (enabled: boolean) => {
      setPushAlertsEnabledState(enabled);
      savePushAlertsEnabled(enabled);
      if (!enabled) return;
      void requestNotificationPermission().then(() => {
        void registerWebPush(alertQueriesRef.current);
      });
    },
    []
  );

  useEffect(() => {
    if (!hydrated || !deps.catalogHydrated || !pushAlertsEnabled) return;

    if (deps.apiActive) {
      const queries = buildAlertQueries();
      void requestNotificationPermission().then(() => {
        void registerWebPush(queries);
      });
      return;
    }

    const stopPoll = startPushAlertPolling(
      () => depsRef.current.listingsRef.current ?? [],
      buildAlertQueries,
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
    buildAlertQueries,
  ]);

  useEffect(() => {
    if (!hydrated || !deps.catalogHydrated || !deps.apiActive || !pushAlertsEnabled) {
      return;
    }
    const queries = buildAlertQueries();
    void apiSyncAlertQueries(queries);
  }, [
    deps.searchQuery,
    deps.searchIntentEvents,
    hydrated,
    deps.catalogHydrated,
    deps.apiActive,
    pushAlertsEnabled,
    buildAlertQueries,
  ]);

  useEffect(() => {
    if (!hydrated || !deps.catalogHydrated) return;
    const q = deps.searchQuery.trim();
    if (q.length < 3) return;
    const next = [...new Set([...alertQueriesRef.current, q.toLowerCase()])];
    alertQueriesRef.current = next;
    saveAlertQueries(next);
  }, [deps.searchQuery, hydrated, deps.catalogHydrated]);

  const value = useMemo(
    (): PushAlertsContextValue => ({
      pushAlertsEnabled,
      setPushAlertsEnabled,
    }),
    [pushAlertsEnabled, setPushAlertsEnabled]
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

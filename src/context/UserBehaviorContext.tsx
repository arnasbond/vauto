"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  USER_BEHAVIOR_MAX_EVENTS,
  type UserBehaviorActionType,
  type UserBehaviorEvent,
} from "@/lib/user-behavior-types";

export interface UserBehaviorContextValue {
  events: UserBehaviorEvent[];
  trackEvent: (actionType: UserBehaviorActionType, payload?: Record<string, unknown>) => void;
  getBehaviorSnapshot: () => UserBehaviorEvent[];
  shouldFireIntervention: (key: string) => boolean;
}

const UserBehaviorContext = createContext<UserBehaviorContextValue | null>(null);

let eventCounter = 0;

function nextEventId(): string {
  eventCounter += 1;
  return `ub-${Date.now()}-${eventCounter}`;
}

export function UserBehaviorProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<UserBehaviorEvent[]>([]);
  const interventionsRef = useRef<Set<string>>(new Set());

  const trackEvent = useCallback(
    (actionType: UserBehaviorActionType, payload: Record<string, unknown> = {}) => {
      const entry: UserBehaviorEvent = {
        id: nextEventId(),
        type: actionType,
        at: Date.now(),
        payload,
      };
      setEvents((prev) => [...prev, entry].slice(-USER_BEHAVIOR_MAX_EVENTS));
    },
    []
  );

  const getBehaviorSnapshot = useCallback(() => events, [events]);

  const shouldFireIntervention = useCallback((key: string) => {
    if (interventionsRef.current.has(key)) return false;
    interventionsRef.current.add(key);
    return true;
  }, []);

  const value = useMemo(
    () => ({
      events,
      trackEvent,
      getBehaviorSnapshot,
      shouldFireIntervention,
    }),
    [events, trackEvent, getBehaviorSnapshot, shouldFireIntervention]
  );

  return (
    <UserBehaviorContext.Provider value={value}>{children}</UserBehaviorContext.Provider>
  );
}

export function useUserBehavior(): UserBehaviorContextValue {
  const ctx = useContext(UserBehaviorContext);
  if (!ctx) {
    throw new Error("useUserBehavior must be used within UserBehaviorProvider");
  }
  return ctx;
}

/** Optional hook for components outside provider tree (no-op). */
export function useUserBehaviorOptional(): UserBehaviorContextValue | null {
  return useContext(UserBehaviorContext);
}

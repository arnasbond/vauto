"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { VautoAgentContext } from "@/lib/vauto-agent-client";
import {
  extractSearchRefinement,
  mergeSearchFilters,
  type AgentSearchFilters,
} from "@/lib/agent-session-memory";
import {
  DEFAULT_USER_REGION,
  resolveDefaultUserCity,
  resolvePrimaryVehicle,
  type PrimaryVehicle,
} from "@/lib/zero-ui-defaults";
import type { UserProfile } from "@/lib/types";

export interface ZeroUiMemoryContextValue {
  defaultRegion: string;
  primaryVehicle: PrimaryVehicle;
  activeSearchFilters: AgentSearchFilters | null;
  buildAgentContext: (user: UserProfile) => Pick<
    VautoAgentContext,
    | "userCity"
    | "defaultRegion"
    | "primaryVehicle"
    | "activeSearchFilters"
  >;
  noteUserMessage: (text: string) => void;
  recordSearchFilters: (filters: Partial<AgentSearchFilters>) => void;
  clearSearchFilters: () => void;
}

const ZeroUiMemoryContext = createContext<ZeroUiMemoryContextValue | null>(null);

export function ZeroUiMemoryProvider({ children }: { children: ReactNode }) {
  const [activeSearchFilters, setActiveSearchFilters] =
    useState<AgentSearchFilters | null>(null);

  const noteUserMessage = useCallback((text: string) => {
    const refinement = extractSearchRefinement(text);
    if (!refinement) return;
    setActiveSearchFilters((prev) =>
      mergeSearchFilters(prev, { refinements: [refinement] })
    );
  }, []);

  const recordSearchFilters = useCallback((filters: Partial<AgentSearchFilters>) => {
    setActiveSearchFilters((prev) => mergeSearchFilters(prev, filters));
  }, []);

  const clearSearchFilters = useCallback(() => {
    setActiveSearchFilters(null);
  }, []);

  const buildAgentContext = useCallback(
    (user: UserProfile) => {
      const defaultRegion = resolveDefaultUserCity(user.city);
      const primaryVehicle = resolvePrimaryVehicle(
        user.primaryVehicle as Partial<PrimaryVehicle> | undefined
      );

      return {
        userCity: defaultRegion || DEFAULT_USER_REGION,
        defaultRegion: defaultRegion || DEFAULT_USER_REGION,
        primaryVehicle,
        activeSearchFilters,
      };
    },
    [activeSearchFilters]
  );

  const value = useMemo(
    (): ZeroUiMemoryContextValue => ({
      defaultRegion: DEFAULT_USER_REGION,
      primaryVehicle: resolvePrimaryVehicle(null),
      activeSearchFilters,
      buildAgentContext,
      noteUserMessage,
      recordSearchFilters,
      clearSearchFilters,
    }),
    [
      activeSearchFilters,
      buildAgentContext,
      clearSearchFilters,
      noteUserMessage,
      recordSearchFilters,
    ]
  );

  return (
    <ZeroUiMemoryContext.Provider value={value}>
      {children}
    </ZeroUiMemoryContext.Provider>
  );
}

export function useZeroUiMemory(): ZeroUiMemoryContextValue {
  const ctx = useContext(ZeroUiMemoryContext);
  if (!ctx) {
    throw new Error("useZeroUiMemory must be used within ZeroUiMemoryProvider");
  }
  return ctx;
}

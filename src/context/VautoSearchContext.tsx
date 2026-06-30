"use client";

/**
 * P7d — marketplace search state isolated from VautoProvider mega-context.
 * State and dispatch are split so catalog/seller providers do not re-render on keystrokes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_MARKETPLACE_FILTERS,
  normalizeMarketplaceFilters,
  type MarketplaceFilterState,
  type MarketplaceViewMode,
} from "@/lib/marketplace-view";
import type { SearchInputMode } from "@/lib/buddy-messages";

export interface VautoSearchState {
  searchQuery: string;
  searchLoading: boolean;
  marketplaceFilters: MarketplaceFilterState;
  viewMode: MarketplaceViewMode;
  agentPinnedListingIds: string[] | null;
  searchInputMode: SearchInputMode;
  searchVoiceMode: boolean;
}

export interface VautoSearchDispatch {
  setSearchQuery: (q: string) => void;
  setSearchLoading: (loading: boolean) => void;
  setMarketplaceFilters: (filters: MarketplaceFilterState) => void;
  resetMarketplaceFilters: () => void;
  setViewMode: (mode: MarketplaceViewMode) => void;
  setAgentPinnedListings: (ids: string[] | null) => void;
  clearAgentPinnedListings: () => void;
  setSearchInputMode: (mode: SearchInputMode) => void;
  setSearchVoiceMode: (on: boolean) => void;
}

export type VautoSearchContextValue = VautoSearchState & VautoSearchDispatch;

const VautoSearchStateContext = createContext<VautoSearchState | null>(null);
const VautoSearchDispatchContext = createContext<VautoSearchDispatch | null>(null);

export function VautoSearchProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [agentPinnedListingIds, setAgentPinnedListingIds] = useState<string[] | null>(
    null
  );
  const [viewMode, setViewMode] = useState<MarketplaceViewMode>("grid");
  const [marketplaceFilters, setMarketplaceFiltersState] =
    useState<MarketplaceFilterState>(DEFAULT_MARKETPLACE_FILTERS);
  const [searchInputMode, setSearchInputMode] = useState<SearchInputMode>(null);
  const [searchVoiceMode, setSearchVoiceMode] = useState(false);

  const setMarketplaceFilters = useCallback((next: MarketplaceFilterState) => {
    setMarketplaceFiltersState(normalizeMarketplaceFilters(next));
  }, []);

  const resetMarketplaceFilters = useCallback(() => {
    setMarketplaceFiltersState(DEFAULT_MARKETPLACE_FILTERS);
  }, []);

  const setAgentPinnedListings = useCallback((ids: string[] | null) => {
    setAgentPinnedListingIds(ids);
  }, []);

  const clearAgentPinnedListings = useCallback(() => {
    setAgentPinnedListingIds(null);
  }, []);

  const state = useMemo(
    (): VautoSearchState => ({
      searchQuery,
      searchLoading,
      marketplaceFilters,
      viewMode,
      agentPinnedListingIds,
      searchInputMode,
      searchVoiceMode,
    }),
    [
      searchQuery,
      searchLoading,
      marketplaceFilters,
      viewMode,
      agentPinnedListingIds,
      searchInputMode,
      searchVoiceMode,
    ]
  );

  const dispatch = useMemo(
    (): VautoSearchDispatch => ({
      setSearchQuery,
      setSearchLoading,
      setMarketplaceFilters,
      resetMarketplaceFilters,
      setViewMode,
      setAgentPinnedListings,
      clearAgentPinnedListings,
      setSearchInputMode,
      setSearchVoiceMode,
    }),
    [
      setMarketplaceFilters,
      resetMarketplaceFilters,
      setAgentPinnedListings,
      clearAgentPinnedListings,
    ]
  );

  return (
    <VautoSearchDispatchContext.Provider value={dispatch}>
      <VautoSearchStateContext.Provider value={state}>
        {children}
      </VautoSearchStateContext.Provider>
    </VautoSearchDispatchContext.Provider>
  );
}

export function useVautoSearchState(): VautoSearchState {
  const ctx = useContext(VautoSearchStateContext);
  if (!ctx) {
    throw new Error("useVautoSearchState must be used within VautoSearchProvider");
  }
  return ctx;
}

export function useVautoSearchDispatch(): VautoSearchDispatch {
  const ctx = useContext(VautoSearchDispatchContext);
  if (!ctx) {
    throw new Error("useVautoSearchDispatch must be used within VautoSearchProvider");
  }
  return ctx;
}

export function useVautoSearch(): VautoSearchContextValue {
  return { ...useVautoSearchState(), ...useVautoSearchDispatch() };
}

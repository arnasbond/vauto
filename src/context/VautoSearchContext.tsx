"use client";

/**
 * P9 — useVauto() diet phase 1: marketplace search state isolated from mega-context.
 * VautoContext consumes this provider to reduce re-render blast radius on search typing.
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

export interface VautoSearchContextValue {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchLoading: boolean;
  setSearchLoading: (loading: boolean) => void;
  marketplaceFilters: MarketplaceFilterState;
  setMarketplaceFilters: (filters: MarketplaceFilterState) => void;
  resetMarketplaceFilters: () => void;
  viewMode: MarketplaceViewMode;
  setViewMode: (mode: MarketplaceViewMode) => void;
  agentPinnedListingIds: string[] | null;
  setAgentPinnedListings: (ids: string[] | null) => void;
  searchInputMode: SearchInputMode;
  setSearchInputMode: (mode: SearchInputMode) => void;
  searchVoiceMode: boolean;
  setSearchVoiceMode: (on: boolean) => void;
}

const VautoSearchContext = createContext<VautoSearchContextValue | null>(null);

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

  const value = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      searchLoading,
      setSearchLoading,
      marketplaceFilters,
      setMarketplaceFilters,
      resetMarketplaceFilters,
      viewMode,
      setViewMode,
      agentPinnedListingIds,
      setAgentPinnedListings,
      searchInputMode,
      setSearchInputMode,
      searchVoiceMode,
      setSearchVoiceMode,
    }),
    [
      searchQuery,
      searchLoading,
      marketplaceFilters,
      setMarketplaceFilters,
      resetMarketplaceFilters,
      viewMode,
      agentPinnedListingIds,
      setAgentPinnedListings,
      searchInputMode,
      searchVoiceMode,
    ]
  );

  return (
    <VautoSearchContext.Provider value={value}>{children}</VautoSearchContext.Provider>
  );
}

export function useVautoSearch(): VautoSearchContextValue {
  const ctx = useContext(VautoSearchContext);
  if (!ctx) {
    throw new Error("useVautoSearch must be used within VautoSearchProvider");
  }
  return ctx;
}

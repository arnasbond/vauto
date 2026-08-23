"use client";

/**
 * P7d — marketplace search state isolated from VautoProvider mega-context.
 * State and dispatch are split so catalog/seller providers do not re-render on keystrokes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

const VIEW_PARAM = "view";

/**
 * Canonical URL view parser (17.1-A). Missing or invalid ?view => "grid".
 * Every consumer (initial render, URL sync, popstate) uses this single function
 * so Back/Forward deterministically restores the view state, and an absent
 * parameter always means the default (grid).
 */
export function parseViewMode(value: string | null | undefined): MarketplaceViewMode {
  if (value === "list" || value === "map") return value;
  return "grid";
}

/** Whether the given ?view value is valid and currently reflected in state. */
function isValidViewParam(value: string | null | undefined): boolean {
  return value === "list" || value === "map" || value == null;
}

function currentViewParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(VIEW_PARAM);
}

/** Build the target href for a given view mode (grid removes the param). */
function hrefForView(baseHref: string, mode: MarketplaceViewMode): string {
  const url = new URL(baseHref, window.location.href);
  if (mode === "grid") {
    url.searchParams.delete(VIEW_PARAM);
  } else {
    url.searchParams.set(VIEW_PARAM, mode);
  }
  return url.toString();
}

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
  const [viewMode, setViewModeState] = useState<MarketplaceViewMode>(
    () => parseViewMode(currentViewParam())
  );
  const [marketplaceFilters, setMarketplaceFiltersState] =
    useState<MarketplaceFilterState>(DEFAULT_MARKETPLACE_FILTERS);
  const [searchInputMode, setSearchInputMode] = useState<SearchInputMode>(null);
  const [searchVoiceMode, setSearchVoiceMode] = useState(false);

  const urlModeRef = useRef<MarketplaceViewMode>(viewMode);

  /**
   * Intentional user view change (grid→list→map) is a navigational state:
   * use pushState so browser Back/Forward traverses each step. Initial URL is
   * NOT pushed here — it already exists in history.
   */
  const setViewMode = useCallback((next: MarketplaceViewMode) => {
    if (next === urlModeRef.current) return;
    urlModeRef.current = next;
    setViewModeState(next);
    if (typeof window !== "undefined") {
      const target = hrefForView(window.location.href, next);
      if (target !== window.location.href) {
        window.history.pushState(window.history.state, "", target);
      }
    }
  }, []);

  // Sync any non-user URL change (Back/Forward or external navigation) into
  // state via the canonical parser, and normalize invalid/should-be-absent
  // ?view values back to a clean URL using replaceState (no full reload).
  useEffect(() => {
    const onPopState = () => {
      const next = parseViewMode(currentViewParam());
      if (next !== urlModeRef.current) {
        urlModeRef.current = next;
        setViewModeState(next);
      }
      // Canonical normalisation: if the URL exposed an invalid ?view while the
      // state resolves to grid, clean it up with replaceState (no reload).
      if (next === "grid") {
        const raw = currentViewParam();
        if (raw !== null && raw !== "" && window.location.search.includes(`${VIEW_PARAM}=`)) {
          const clean = hrefForView(window.location.href, "grid");
          if (clean !== window.location.href) {
            window.history.replaceState(window.history.state, "", clean);
          }
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Mount/normalization guard: if the entry URL carried ?view=invalid (which the
  // parser maps to grid), canonicalize it once with replaceState.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = currentViewParam();
    if (viewMode === "grid" && raw !== null && !isValidViewParam(raw)) {
      const clean = hrefForView(window.location.href, "grid");
      if (clean !== window.location.href) {
        window.history.replaceState(window.history.state, "", clean);
      }
    }
  }, [viewMode]);

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
      setViewMode,
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

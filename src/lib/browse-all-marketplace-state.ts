/**
 * Single dispatch for browse-all — clears text query and filter state so grid + sidebar stay in sync.
 */

export interface BrowseAllMarketplaceStateDeps {
  setSearchQuery: (q: string) => void;
  setAgentPinnedListings: (ids: string[] | null) => void;
  clearSearchFilters: () => void;
  resetMarketplaceFilters: () => void;
  clearVisualSearch?: (opts?: { keepInputMode?: boolean }) => void;
  setSearchInputMode?: (mode: "text" | "voice") => void;
  setSearchVoiceMode?: (v: boolean) => void;
  setViewMode?: (mode: "grid" | "list" | "map") => void;
}

/** Force-clear global search text and marketplace filters for full-catalog browse. */
export function applyBrowseAllMarketplaceState(
  deps: BrowseAllMarketplaceStateDeps
): void {
  deps.clearVisualSearch?.({ keepInputMode: true });
  deps.setSearchInputMode?.("text");
  deps.setSearchVoiceMode?.(false);
  deps.setSearchQuery("");
  deps.setAgentPinnedListings(null);
  deps.resetMarketplaceFilters();
  deps.clearSearchFilters();
  deps.setViewMode?.("grid");
}

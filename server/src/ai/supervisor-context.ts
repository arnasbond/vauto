/**
 * Supervisor state injection — kiekvienam Gemini kvietimui perduodama pilna programos būsena.
 */

import type { AgentSearchFilters } from "./agent-memory-context.js";

export interface SupervisorUploadMetadata {
  pendingImageUrls?: string[];
  pendingImageCount?: number;
  visionHint?: string;
  lastVisionSummary?: string;
}

export interface SupervisorApplicationState {
  current_page_url: string;
  active_filters: Record<string, unknown>;
  total_listings_count: number;
  upload_metadata: SupervisorUploadMetadata;
}

export interface SupervisorContextSource {
  supervisorState?: SupervisorApplicationState;
  currentPageContext?: { page_id?: string };
  activeSearchFilters?: AgentSearchFilters | null;
  searchResultCount?: number;
  lastSearchQuery?: string;
  pendingImageUrls?: string[];
}

export function resolveSupervisorStateFromRequest(
  context: SupervisorContextSource
): SupervisorApplicationState {
  if (context.supervisorState) {
    return context.supervisorState;
  }

  const filters: Record<string, unknown> = {
    ...(context.activeSearchFilters ?? {}),
  };
  if (context.lastSearchQuery?.trim()) {
    filters.query = context.lastSearchQuery.trim();
  }

  return {
    current_page_url: context.currentPageContext?.page_id ?? "/",
    active_filters: filters,
    total_listings_count: context.searchResultCount ?? 0,
    upload_metadata: {
      pendingImageUrls: context.pendingImageUrls?.slice(0, 6),
      pendingImageCount: context.pendingImageUrls?.length ?? 0,
    },
  };
}

export function buildSupervisorStateInjectionBlock(
  state: SupervisorApplicationState
): string {
  return `[SISTEMOS BŪSENA — tavo akys ir ausys]
Tu nuolat matai šį vaizdą; kalbėk ir veik atsižvelgdamas į jį:

current_page_url: ${state.current_page_url}
active_filters: ${JSON.stringify(state.active_filters)}
total_listings_count: ${state.total_listings_count}
upload_metadata: ${JSON.stringify(state.upload_metadata)}`;
}

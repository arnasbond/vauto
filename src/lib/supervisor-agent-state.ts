import type { AgentSearchFilters } from "@/lib/vauto-agent-client";
import {
  effectiveMarketplaceSearchQuery,
} from "@/lib/browse-all-intent";
import {
  buildSupervisorCurrentUser,
  type SupervisorCurrentUser,
} from "@/lib/supervisor-user-session";

export type { SupervisorCurrentUser };

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
  current_user: SupervisorCurrentUser;
}

export function buildSupervisorApplicationState(params: {
  pageUrl: string;
  searchQuery?: string;
  activeSearchFilters?: AgentSearchFilters | null;
  totalListingsCount: number;
  pendingImageUrls?: string[];
  visionHint?: string;
  currentUser: SupervisorCurrentUser;
}): SupervisorApplicationState {
  const filters: Record<string, unknown> = {
    ...(params.activeSearchFilters ?? {}),
  };
  const query = effectiveMarketplaceSearchQuery(params.searchQuery?.trim() ?? "");
  if (query) {
    filters.query = query;
  }

  const images = params.pendingImageUrls?.filter(Boolean).slice(0, 6);

  return {
    current_page_url: params.pageUrl || "/",
    active_filters: filters,
    total_listings_count: params.totalListingsCount,
    upload_metadata: {
      pendingImageUrls: images?.length ? images : undefined,
      pendingImageCount: images?.length ?? 0,
      visionHint: params.visionHint,
    },
    current_user: params.currentUser,
  };
}

export { buildSupervisorCurrentUser };

export function resolveClientPageUrl(pathname: string, search?: string): string {
  const path = pathname?.replace(/\/$/, "") || "/";
  const qs = search?.trim();
  return qs ? `${path}${qs.startsWith("?") ? qs : `?${qs}`}` : path;
}

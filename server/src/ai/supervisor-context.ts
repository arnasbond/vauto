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

export interface SupervisorCurrentUser {
  id?: string;
  name: string;
  firstName: string;
  status: "authenticated" | "guest";
  accountType?: string;
  role?: string;
  city?: string;
  hasSessionToken: boolean;
}

export interface SupervisorApplicationState {
  current_page_url: string;
  active_filters: Record<string, unknown>;
  total_listings_count: number;
  upload_metadata: SupervisorUploadMetadata;
  current_user: SupervisorCurrentUser;
}

export interface SupervisorContextSource {
  supervisorState?: SupervisorApplicationState;
  currentPageContext?: { page_id?: string };
  activeSearchFilters?: AgentSearchFilters | null;
  searchResultCount?: number;
  lastSearchQuery?: string;
  pendingImageUrls?: string[];
  userName?: string;
  isAuthenticated?: boolean;
  accountType?: string;
  userRole?: string;
  userCity?: string;
}

export function resolveSupervisorCurrentUser(
  context: SupervisorContextSource,
  authUserId?: string
): SupervisorCurrentUser {
  if (context.supervisorState?.current_user) {
    return context.supervisorState.current_user;
  }

  const name = context.userName?.trim() || "Svečias";
  const firstName = name.split(/\s+/)[0] || name;
  const authenticated = Boolean(authUserId || context.isAuthenticated);

  return {
    id: authUserId,
    name,
    firstName,
    status: authenticated ? "authenticated" : "guest",
    accountType: context.accountType,
    role: context.userRole,
    city: context.userCity,
    hasSessionToken: Boolean(authUserId),
  };
}

export function resolveSupervisorStateFromRequest(
  context: SupervisorContextSource,
  authUserId?: string
): SupervisorApplicationState {
  const current_user = resolveSupervisorCurrentUser(context, authUserId);

  if (context.supervisorState) {
    return {
      ...context.supervisorState,
      current_user: context.supervisorState.current_user ?? current_user,
    };
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
    current_user,
  };
}

export function buildSupervisorStateInjectionBlock(
  state: SupervisorApplicationState
): string {
  const userLine = JSON.stringify({
    id: state.current_user.id,
    name: state.current_user.name,
    firstName: state.current_user.firstName,
    status: state.current_user.status,
    accountType: state.current_user.accountType,
    role: state.current_user.role,
    city: state.current_user.city,
  });

  return `[SISTEMOS BŪSENA — tavo akys ir ausys]
Tu nuolat matai šį vaizdą; kalbėk ir veik atsižvelgdamas į jį:

current_page_url: ${state.current_page_url}
active_filters: ${JSON.stringify(state.active_filters)}
total_listings_count: ${state.total_listings_count}
upload_metadata: ${JSON.stringify(state.upload_metadata)}
current_user: ${userLine}`;
}

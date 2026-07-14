/**
 * Supervisor state injection — kiekvienam Gemini kvietimui perduodama pilna programos būsena.
 */

import type { AgentSearchFilters } from "./agent-memory-context.js";
import {
  toLithuanianDative,
  toLithuanianVocative,
} from "./lithuanian-name-case.js";

export interface SupervisorUploadMetadata {
  /** Count only — never embed base64 URLs in supervisor state (payload size). */
  pendingImageCount?: number;
  visionHint?: string;
  lastVisionSummary?: string;
}

export interface SupervisorCurrentUser {
  id?: string;
  name: string;
  firstName: string;
  /** Šauksmininkas — tiesioginis kreipinys („Arnai“). */
  firstNameVocative: string;
  /** Naudininkas — nuosavybė / nauda („Arnui“). */
  firstNameDative: string;
  status: "authenticated" | "guest";
  accountType?: string;
  role?: string;
  city?: string;
  phone?: string;
  email?: string;
  hasVerifiedContacts?: boolean;
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
  pendingImageCount?: number;
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
    const u = context.supervisorState.current_user;
    return {
      ...u,
      firstNameVocative:
        u.firstNameVocative || toLithuanianVocative(u.firstName),
      firstNameDative: u.firstNameDative || toLithuanianDative(u.firstName),
    };
  }

  const name = context.userName?.trim() || "Svečias";
  const firstName = name.split(/\s+/)[0] || name;
  const authenticated = Boolean(authUserId || context.isAuthenticated);

  return {
    id: authUserId,
    name,
    firstName,
    firstNameVocative: toLithuanianVocative(firstName),
    firstNameDative: toLithuanianDative(firstName),
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
  const resolvedUser = resolveSupervisorCurrentUser(context, authUserId);

  if (context.supervisorState) {
    const mergedUser = context.supervisorState.current_user ?? resolvedUser;
    const current_user = {
      ...mergedUser,
      firstNameVocative:
        mergedUser.firstNameVocative ||
        toLithuanianVocative(mergedUser.firstName),
      firstNameDative:
        mergedUser.firstNameDative || toLithuanianDative(mergedUser.firstName),
    };
    return {
      ...context.supervisorState,
      current_user,
    };
  }

  const filters: Record<string, unknown> = {
    ...(context.activeSearchFilters ?? {}),
  };
  if (context.lastSearchQuery?.trim()) {
    filters.query = context.lastSearchQuery.trim();
  }

  const imageCount =
    context.pendingImageCount ??
    context.pendingImageUrls?.filter(Boolean).length ??
    0;

  return {
    current_page_url: context.currentPageContext?.page_id ?? "/",
    active_filters: filters,
    total_listings_count: context.searchResultCount ?? 0,
    upload_metadata: {
      pendingImageCount: imageCount,
    },
    current_user: resolvedUser,
  };
}

export function buildSupervisorStateInjectionBlock(
  state: SupervisorApplicationState
): string {
  const userLine = JSON.stringify({
    id: state.current_user.id,
    name: state.current_user.name,
    firstName: state.current_user.firstName,
    firstNameVocative: state.current_user.firstNameVocative,
    firstNameDative: state.current_user.firstNameDative,
    status: state.current_user.status,
    accountType: state.current_user.accountType,
    role: state.current_user.role,
    city: state.current_user.city,
    phone: state.current_user.phone,
    email: state.current_user.email,
    hasVerifiedContacts: state.current_user.hasVerifiedContacts,
  });

  return `[SISTEMOS BŪSENA — tavo akys ir ausys]
Tu nuolat matai šį vaizdą; kalbėk ir veik atsižvelgdamas į jį:

current_page_url: ${state.current_page_url}
active_filters: ${JSON.stringify(state.active_filters)}
total_listings_count: ${state.total_listings_count}
upload_metadata: ${JSON.stringify(state.upload_metadata)}
current_user: ${userLine}`;
}

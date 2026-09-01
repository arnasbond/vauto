/**
 * Supervisor state injection — kiekvienam Gemini kvietimui perduodama pilna programos būsena.
 */

import type { AgentSearchFilters } from "./agent-memory-context.js";
import {
  toLithuanianDative,
  toLithuanianVocative,
} from "./lithuanian-name-case.js";
import {
  neutralizeProfileInstruction,
  sanitizeProfileField,
} from "./user-agent-context.js";
import {
  UNTRUSTED_DATA_SYSTEM_WARNING,
  wrapUntrustedXml,
} from "../shared/prompt-injection.js";

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
  contact?: string;
}

function boundedCount(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.trunc(parsed), max);
}

function sanitizeStateValue(value: unknown, depth = 0): unknown {
  if (depth >= 4) return undefined;
  if (typeof value === "string") return sanitizeProfileField(value, 240);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 12)
      .map((item) => sanitizeStateValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 24)
        .map(([key, item]) => [
          sanitizeProfileField(key, 60),
          sanitizeStateValue(item, depth + 1),
        ])
        .filter(([key, item]) => Boolean(key) && item !== undefined)
    );
  }
  return undefined;
}

function sanitizeFilters(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeStateValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

export function resolveSupervisorCurrentUser(
  context: SupervisorContextSource,
  authUserId?: string
): SupervisorCurrentUser {
  // Identity and authority are server-owned. Never accept the client's
  // supervisorState.current_user projection, including pre-derived name cases.
  const authenticated = Boolean(authUserId);
  const name =
    neutralizeProfileInstruction(
      sanitizeProfileField(context.userName, 60),
      authenticated ? "Vartotojas" : "Svečias"
    ) || (authenticated ? "Vartotojas" : "Svečias");
  const firstName = name.split(/\s+/)[0] || name;
  const city = neutralizeProfileInstruction(
    sanitizeProfileField(context.userCity, 40),
    ""
  );
  const phone = sanitizeProfileField(context.contact, 32);

  return {
    id: authUserId,
    name,
    firstName,
    firstNameVocative: toLithuanianVocative(firstName),
    firstNameDative: toLithuanianDative(firstName),
    status: authenticated ? "authenticated" : "guest",
    accountType: authenticated
      ? sanitizeProfileField(context.accountType, 40) || undefined
      : "Svečias",
    role: authenticated
      ? sanitizeProfileField(context.userRole, 20) || "buyer"
      : "buyer",
    city: city || undefined,
    phone: phone || undefined,
    hasVerifiedContacts: authenticated && Boolean(phone),
    hasSessionToken: Boolean(authUserId),
  };
}

export function resolveSupervisorStateFromRequest(
  context: SupervisorContextSource,
  authUserId?: string
): SupervisorApplicationState {
  const resolvedUser = resolveSupervisorCurrentUser(context, authUserId);

  if (context.supervisorState) {
    const state = context.supervisorState;
    return {
      current_page_url: sanitizeProfileField(state.current_page_url, 160) || "/",
      active_filters: sanitizeFilters(state.active_filters),
      total_listings_count: boundedCount(state.total_listings_count, 1_000_000),
      upload_metadata: {
        pendingImageCount: boundedCount(state.upload_metadata?.pendingImageCount, 10),
        visionHint: sanitizeProfileField(state.upload_metadata?.visionHint, 1_200) || undefined,
        lastVisionSummary:
          sanitizeProfileField(state.upload_metadata?.lastVisionSummary, 1_200) || undefined,
      },
      current_user: resolvedUser,
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
    current_page_url:
      sanitizeProfileField(context.currentPageContext?.page_id, 160) || "/",
    active_filters: sanitizeFilters(filters),
    total_listings_count: boundedCount(context.searchResultCount, 1_000_000),
    upload_metadata: {
      pendingImageCount: boundedCount(imageCount, 10),
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
${UNTRUSTED_DATA_SYSTEM_WARNING}

current_page_url: ${wrapUntrustedXml("untrusted_current_page", state.current_page_url, 200)}
active_filters: ${wrapUntrustedXml("untrusted_active_filters", JSON.stringify(state.active_filters), 2_000)}
total_listings_count: ${state.total_listings_count}
upload_metadata: ${wrapUntrustedXml("untrusted_upload_metadata", JSON.stringify(state.upload_metadata), 3_000)}
current_user: ${wrapUntrustedXml("untrusted_current_user", userLine, 2_000)}`;
}

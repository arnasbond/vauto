/**
 * Supervisor auth hand-off — session identity for every Gemini turn.
 * JWT stays in Authorization headers only; never sent to the model.
 */

import type { UserProfile } from "@/lib/types";
import { loadAccessToken } from "@/lib/auth/session";
import {
  toLithuanianDative,
  toLithuanianVocative,
} from "@/lib/lithuanian-name-case";

const AUTH_USER_KEY = "vauto_user_v1";
const AUTH_SESSION_KEY = "vauto_auth_v1";

export interface SupervisorCurrentUser {
  id?: string;
  name: string;
  firstName: string;
  firstNameVocative: string;
  firstNameDative: string;
  status: "authenticated" | "guest";
  accountType?: string;
  role?: string;
  city?: string;
  /** True when a session token exists locally (token itself is never sent to Gemini). */
  hasSessionToken: boolean;
}

function readPersistedUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function readPersistedSessionAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw) as { isAuthenticated?: boolean };
    return Boolean(session?.isAuthenticated);
  } catch {
    return false;
  }
}

function resolveFirstName(
  user?: Pick<UserProfile, "firstName" | "name">,
  fallbackName?: string
): string {
  const fromField = user?.firstName?.trim();
  if (fromField) return fromField;
  const full = user?.name?.trim() || fallbackName?.trim() || "";
  if (full) return full.split(/\s+/)[0] || full;
  return "Svečias";
}

/**
 * Build supervisor user profile from React auth state + localStorage hand-off.
 */
export function buildSupervisorCurrentUser(params: {
  user?: Pick<UserProfile, "id" | "name" | "firstName" | "city" | "role">;
  isAuthenticated?: boolean;
  accountType?: string;
  userRole?: string;
}): SupervisorCurrentUser {
  const persisted = readPersistedUserProfile();
  const token = loadAccessToken();
  const sessionFlag = readPersistedSessionAuthenticated();

  const id = params.user?.id?.trim() || persisted?.id?.trim() || undefined;
  const name =
    params.user?.name?.trim() ||
    persisted?.name?.trim() ||
    "Svečias";
  const firstName = resolveFirstName(params.user ?? persisted ?? undefined, name);
  const city = params.user?.city?.trim() || persisted?.city?.trim() || undefined;

  const authenticated = Boolean(
    params.isAuthenticated || sessionFlag || (token && id)
  );

  return {
    id: authenticated ? id : undefined,
    name: authenticated ? name : name === "Svečias" ? "Svečias" : name,
    firstName: authenticated ? firstName : firstName === "Svečias" ? "Svečias" : firstName,
    firstNameVocative: toLithuanianVocative(firstName),
    firstNameDative: toLithuanianDative(firstName),
    status: authenticated ? "authenticated" : "guest",
    accountType: params.accountType,
    role: params.userRole || params.user?.role || persisted?.role,
    city,
    hasSessionToken: Boolean(token),
  };
}

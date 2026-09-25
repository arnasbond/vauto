import { clearAllListingDrafts } from "@/lib/listing-draft-storage";
import { clearAgentThreadId } from "@/lib/agent-thread-link";
import { clearPhotoSearchSession } from "@/lib/photo-search-session";
import { clearPendingPhotoIntent } from "@/lib/photo-intent-session";
import { clearListingEditSession } from "@/lib/listing-edit-session";
import { clearOAuthLaunchContext } from "@/lib/auth/oauth-redirect";
import { clearUserScope, clearLegacyGlobalUserData } from "@/lib/auth/user-scope";

export const AUTH_LOGOUT_EVENT = "vauto:auth-logout";

export function dispatchAuthLogout(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

export function subscribeAuthLogout(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AUTH_LOGOUT_EVENT, handler);
  return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handler);
}

/**
 * Hard privacy purge of all user-scoped client state across localStorage and sessions.
 * Guarantees that neither a subsequent anonymous session nor another user account (User B)
 * can inherit or read drafts, conversation threads, or active listing edits of User A.
 */
export function purgeClientSessionAndDraftState(): void {
  clearAllListingDrafts();
  clearAgentThreadId();
  clearPhotoSearchSession();
  clearPendingPhotoIntent();
  clearListingEditSession();
  clearOAuthLaunchContext();
  clearUserScope();
  clearLegacyGlobalUserData();
  dispatchAuthLogout();
}

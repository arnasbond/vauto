/** Local/demo sessions persist for 90 days — testers should not re-login on refresh. */
export const LOCAL_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Refresh access token when less than this remains before expiry. */
export const TOKEN_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const REMEMBER_PHONE_KEY = "vauto_remember_phone_v1";
export const REMEMBER_ME_KEY = "vauto_remember_me_v1";

export function sessionExpiresAtFromNow(ttlMs = LOCAL_SESSION_TTL_MS): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function isSessionExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function shouldRefreshToken(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < TOKEN_REFRESH_THRESHOLD_MS;
}

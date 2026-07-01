import { apiRefreshAccessToken } from "@/lib/auth/api";
import { isAuthApiAvailable } from "@/lib/auth/api";
import { loadAccessToken, persistAuthSessionFull } from "@/lib/auth/session";
import { loadAuthSession } from "@/lib/storage";
import type { UserProfile } from "@/lib/types";
import { shouldRefreshToken } from "@/lib/auth/session-constants";

export interface RefreshResult {
  token: string;
  expiresAt: string;
}

/**
 * Silently refresh the access token when nearing expiry.
 * Returns new credentials or null if refresh is not needed / failed.
 */
export async function maybeRefreshAccessToken(
  user: UserProfile
): Promise<RefreshResult | null> {
  if (!isAuthApiAvailable()) return null;

  const token = loadAccessToken();
  const auth = loadAuthSession();
  if (!token || !auth?.isAuthenticated) return null;
  if (!shouldRefreshToken(auth.expiresAt)) return null;

  const result = await apiRefreshAccessToken(token);
  if (!result.ok) return null;

  const session = {
    ...auth,
    accessToken: result.data.token,
    expiresAt: result.data.expiresAt,
  };
  await persistAuthSessionFull(session, user);
  return { token: result.data.token, expiresAt: result.data.expiresAt };
}

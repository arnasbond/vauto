import type { AuthSession } from "@/lib/types";
import { saveAuthSession } from "@/lib/storage";

const TOKEN_KEY = "vauto_access_token_v1";

export function loadAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function persistAuthSession(session: AuthSession): void {
  saveAuthSession(session);
  saveAccessToken(session.accessToken ?? null);
}

export function clearAuthSessionFull(): void {
  saveAuthSession({ isAuthenticated: false });
  saveAccessToken(null);
}

export function getAuthHeaders(): Record<string, string> {
  const token = loadAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

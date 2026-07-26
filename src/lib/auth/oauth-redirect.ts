import { Capacitor } from "@capacitor/core";
import { SITE_URL } from "@/lib/site-url";

/** Android/iOS custom URL scheme — register in Google/Apple consoles + AndroidManifest. */
export const VAUTO_APP_SCHEME = "com.vauto.app";
export const VAUTO_APP_ID = "com.vauto.app";

export const AUTH_CALLBACK_PATH = "/auth/callback/";
export const OAUTH_PENDING_STORAGE_KEY = "vauto_oauth_pending";
export const OAUTH_CONTEXT_STORAGE_KEY = "vauto_oauth_context_v1";
export const OAUTH_STATE_COOKIE = "vauto_oauth_state";

/** Origins allowed for Google Identity Services (Authorized JavaScript origins). */
export function getGoogleAuthorizedOrigins(): string[] {
  return [
    SITE_URL,
    "http://localhost:3000",
    "https://localhost",
    "capacitor://localhost",
    "http://localhost",
  ];
}

/** Redirect URIs for Google OAuth / Apple Sign In console configuration. */
export function getGoogleRedirectUris(): string[] {
  return [
    `${SITE_URL}${AUTH_CALLBACK_PATH}`,
    `${SITE_URL}${AUTH_CALLBACK_PATH.slice(0, -1)}`,
    `${VAUTO_APP_SCHEME}://auth/callback`,
    "http://localhost:3000/auth/callback/",
  ];
}

export function getAppleRedirectUris(): string[] {
  const clientId =
    process.env.NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID?.trim() || undefined;
  return [
    `${SITE_URL}${AUTH_CALLBACK_PATH}`,
    `${SITE_URL}${AUTH_CALLBACK_PATH.slice(0, -1)}`,
    `${VAUTO_APP_SCHEME}://auth/callback`,
    "http://localhost:3000/auth/callback/",
    ...(clientId ? [`https://${clientId}`] : []),
  ];
}

export function getAuthOrigin(): string {
  if (typeof window === "undefined") return SITE_URL;
  return window.location.origin;
}

export function isAllowedAuthOrigin(origin?: string): boolean {
  const value = (origin ?? getAuthOrigin()).replace(/\/$/, "");
  return getGoogleAuthorizedOrigins().some(
    (allowed) => allowed.replace(/\/$/, "") === value
  );
}

export function isNativeAuthEnvironment(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Prefer full-page OAuth redirect when popups / One Tap are unreliable:
 * iOS WebKit, and Chromium Incognito (partitioned storage / 3P cookies).
 * Note: One Tap failure still falls back to redirect in startGoogleSignIn.
 */
export function prefersOAuthRedirectFlow(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return true;
  // Chromium private mode often reports deviceMemory === 0.5.
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if (
      typeof nav.deviceMemory === "number" &&
      nav.deviceMemory > 0 &&
      nav.deviceMemory <= 0.5
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export interface OAuthPendingPayload {
  provider: "google" | "apple";
  idToken?: string;
  credential?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  returnPath?: string;
  signupIntent?: "private" | "pro" | "wardrobe";
  receivedAt: string;
}

export interface OAuthLaunchContext {
  provider: "google" | "apple";
  state: string;
  returnPath: string;
  signupIntent?: "private" | "pro" | "wardrobe";
  createdAt: string;
}

function cookieSecureSuffix(): string {
  if (typeof window === "undefined") return "";
  return window.location.protocol === "https:" ? "; Secure" : "";
}

/** CSRF state cookie — SameSite=Lax + Secure on HTTPS (iOS Safari friendly). */
export function setOAuthStateCookie(state: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=600; SameSite=Lax${cookieSecureSuffix()}`;
}

export function readOAuthStateCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${OAUTH_STATE_COOKIE}=([^;]*)`)
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function clearOAuthStateCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureSuffix()}`;
}

export function createOAuthState(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function persistOAuthLaunchContext(
  ctx: Omit<OAuthLaunchContext, "createdAt">
): OAuthLaunchContext {
  const full: OAuthLaunchContext = {
    ...ctx,
    createdAt: new Date().toISOString(),
  };
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(OAUTH_CONTEXT_STORAGE_KEY, JSON.stringify(full));
  }
  setOAuthStateCookie(ctx.state);
  return full;
}

export function loadOAuthLaunchContext(): OAuthLaunchContext | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(OAUTH_CONTEXT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthLaunchContext;
  } catch {
    return null;
  }
}

export function clearOAuthLaunchContext(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(OAUTH_CONTEXT_STORAGE_KEY);
  }
  clearOAuthStateCookie();
}

export function verifyOAuthState(state: string | null | undefined): boolean {
  if (!state) return false;
  const fromCookie = readOAuthStateCookie();
  const fromContext = loadOAuthLaunchContext()?.state;
  return state === fromCookie || state === fromContext;
}

function parseAppleUserParam(
  raw: string | null
): { email?: string; firstName?: string; lastName?: string; name?: string } {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as {
      email?: string;
      name?: { firstName?: string; lastName?: string };
    };
    const firstName = parsed.name?.firstName?.trim() || undefined;
    const lastName = parsed.name?.lastName?.trim() || undefined;
    const name = [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;
    return {
      email: parsed.email?.trim() || undefined,
      firstName,
      lastName,
      name,
    };
  } catch {
    return {};
  }
}

export function storeOAuthCallbackPayload(rawUrl: string): OAuthPendingPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(rawUrl);
    const isAppScheme = url.protocol === `${VAUTO_APP_SCHEME}:`;
    const isWebCallback =
      url.pathname.includes("/auth/callback") ||
      url.pathname.endsWith("/auth/callback");

    if (!isAppScheme && !isWebCallback) return null;

    const params = url.searchParams;
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const idToken =
      params.get("id_token") ??
      hashParams.get("id_token") ??
      params.get("credential") ??
      hashParams.get("credential") ??
      undefined;

    const state =
      params.get("state") ?? hashParams.get("state") ?? undefined;
    if (state && !verifyOAuthState(state)) {
      console.warn("[VAUTO] OAuth state mismatch — rejecting callback");
      clearOAuthLaunchContext();
      return null;
    }

    const provider =
      (params.get("provider") as "google" | "apple" | null) ??
      (hashParams.get("provider") as "google" | "apple" | null) ??
      (loadOAuthLaunchContext()?.provider as "google" | "apple" | undefined) ??
      "apple";

    const userRaw = params.get("user") ?? hashParams.get("user");
    const appleUser = parseAppleUserParam(userRaw);
    const ctx = loadOAuthLaunchContext();

    const payload: OAuthPendingPayload = {
      provider,
      idToken: idToken ?? undefined,
      credential: idToken ?? undefined,
      email:
        appleUser.email ??
        params.get("email") ??
        hashParams.get("email") ??
        undefined,
      name: appleUser.name,
      firstName: appleUser.firstName,
      lastName: appleUser.lastName,
      returnPath: ctx?.returnPath,
      signupIntent: ctx?.signupIntent,
      receivedAt: new Date().toISOString(),
    };

    sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, JSON.stringify(payload));
    clearOAuthLaunchContext();
    return payload;
  } catch {
    return null;
  }
}

export function consumeOAuthPendingPayload(): OAuthPendingPayload | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(OAUTH_PENDING_STORAGE_KEY);
  try {
    return JSON.parse(raw) as OAuthPendingPayload;
  } catch {
    return null;
  }
}

export function getNativeAuthCallbackUrl(): string {
  return `${VAUTO_APP_SCHEME}://auth/callback`;
}

export function getWebAuthCallbackUrl(): string {
  const origin =
    typeof window !== "undefined" && isAllowedAuthOrigin()
      ? getAuthOrigin()
      : SITE_URL;
  return `${origin.replace(/\/$/, "")}${AUTH_CALLBACK_PATH}`;
}

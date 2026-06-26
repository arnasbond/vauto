import { Capacitor } from "@capacitor/core";
import { SITE_URL } from "@/lib/social-share";

/** Android/iOS custom URL scheme — register in Google/Apple consoles + AndroidManifest. */
export const VAUTO_APP_SCHEME = "com.vauto.app";
export const VAUTO_APP_ID = "com.vauto.app";

export const AUTH_CALLBACK_PATH = "/auth/callback/";
export const OAUTH_PENDING_STORAGE_KEY = "vauto_oauth_pending";

/** Origins allowed for Google Identity Services (Authorized JavaScript origins). */
export function getGoogleAuthorizedOrigins(): string[] {
  return [
    SITE_URL,
    "https://vauto-chi.vercel.app",
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
  const clientId = process.env.NEXT_PUBLIC_APPLE_AUTH_CLIENT_ID;
  return [
    `${SITE_URL}${AUTH_CALLBACK_PATH}`,
    `${VAUTO_APP_SCHEME}://auth/callback`,
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

export interface OAuthPendingPayload {
  provider: "google" | "apple";
  idToken?: string;
  credential?: string;
  receivedAt: string;
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

    const provider =
      (params.get("provider") as "google" | "apple" | null) ??
      (hashParams.get("provider") as "google" | "apple" | null) ??
      "google";

    const payload: OAuthPendingPayload = {
      provider,
      idToken: idToken ?? undefined,
      credential: idToken ?? undefined,
      receivedAt: new Date().toISOString(),
    };

    sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, JSON.stringify(payload));
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

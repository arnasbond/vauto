import { getRuntimeAppleClientId } from "@/lib/api/config";
import {
  getAppleRedirectUris,
  getWebAuthCallbackUrl,
  isNativeAuthEnvironment,
} from "@/lib/auth/oauth-redirect";

const APPLE_SCRIPT_ID = "apple-auth-script";
const APPLE_SCRIPT_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          state?: string;
          usePopup?: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; code?: string };
          user?: {
            email?: string;
            name?: { firstName?: string; lastName?: string };
          };
        }>;
      };
    };
  }
}

export interface AppleSignInResult {
  idToken: string;
  email?: string;
  name?: string;
}

export function getAppleClientId(): string | null {
  return getRuntimeAppleClientId();
}

export function isAppleAuthConfigured(): boolean {
  return Boolean(getAppleClientId());
}

/** Return URLs to register in Apple Developer → Sign in with Apple. */
export function getConfiguredAppleRedirectUris(): string[] {
  return getAppleRedirectUris();
}

export function getAppleAuthRedirectUri(): string {
  return getWebAuthCallbackUrl();
}

export function isAppleNativeAuthEnvironment(): boolean {
  return isNativeAuthEnvironment();
}

function loadAppleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.AppleID?.auth) {
      resolve();
      return;
    }
    const existing = document.getElementById(APPLE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Apple Sign In script failed"))
      );
      return;
    }
    const script = document.createElement("script");
    script.id = APPLE_SCRIPT_ID;
    script.src = APPLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Apple Sign In script failed"));
    document.head.appendChild(script);
  });
}

/** Opens Apple Sign In popup; resolves with identity token. */
export async function requestAppleIdToken(): Promise<AppleSignInResult | null> {
  const clientId = getAppleClientId();
  if (!clientId || typeof window === "undefined") return null;

  if (isNativeAuthEnvironment()) {
    // Native Capacitor flow uses deep-link callback — handled separately.
    return null;
  }

  try {
    await loadAppleScript();
    window.AppleID!.auth.init({
      clientId,
      scope: "name email",
      redirectURI: getAppleAuthRedirectUri(),
      usePopup: true,
    });
    const response = await window.AppleID!.auth.signIn();
    const idToken = response.authorization?.id_token;
    if (!idToken) return null;

    const name = response.user?.name
      ? [response.user.name.firstName, response.user.name.lastName]
          .filter(Boolean)
          .join(" ")
          .trim()
      : undefined;

    return {
      idToken,
      email: response.user?.email,
      name: name || undefined,
    };
  } catch {
    return null;
  }
}

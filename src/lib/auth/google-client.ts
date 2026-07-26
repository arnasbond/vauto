import { getRuntimeGoogleClientId } from "@/lib/api/config";
import {
  createOAuthState,
  getAuthOrigin,
  getGoogleRedirectUris,
  getWebAuthCallbackUrl,
  isAllowedAuthOrigin,
  isNativeAuthEnvironment,
  persistOAuthLaunchContext,
  prefersOAuthRedirectFlow,
} from "@/lib/auth/oauth-redirect";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential: string }) => void;
            auto_select?: boolean;
            use_fedcm_for_prompt?: boolean;
            use_fedcm_for_button?: boolean;
            ux_mode?: "popup" | "redirect";
            login_uri?: string;
          }) => void;
          prompt: (cb?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment?: () => boolean;
            getNotDisplayedReason?: () => string;
          }) => void) => void;
          renderButton: (
            el: HTMLElement,
            cfg: {
              theme?: string;
              size?: string;
              width?: number;
              locale?: string;
            }
          ) => void;
        };
      };
    };
  }
}

const SCRIPT_ID = "google-gsi-script";

export type GoogleSignInOutcome =
  | { status: "success"; idToken: string }
  | { status: "redirecting" }
  | { status: "needs_button" }
  | { status: "error"; message: string };

export function getGoogleClientId(): string | null {
  return getRuntimeGoogleClientId();
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

/** Redirect URIs to whitelist in Google Cloud Console (Web + Capacitor). */
export function getConfiguredGoogleRedirectUris(): string[] {
  return getGoogleRedirectUris();
}

function assertAuthOrigin(): void {
  if (typeof window === "undefined") return;
  if (!isAllowedAuthOrigin()) {
    console.warn(
      `[VAUTO] Auth origin "${getAuthOrigin()}" is not in authorized list. ` +
        `Add it to Google Cloud Console → Authorized JavaScript origins.`
    );
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google script failed"))
      );
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed"));
    document.head.appendChild(script);
  });
}

function createNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Full-page Google OAuth (implicit id_token) — works in Incognito when One Tap /
 * FedCM / 3P cookies are blocked. Callback page already parses #id_token.
 */
export function startGoogleRedirectSignIn(opts: {
  returnPath: string;
  signupIntent?: "private" | "pro" | "wardrobe";
}): GoogleSignInOutcome {
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === "undefined") {
    return {
      status: "error",
      message: "Google Client ID nesukonfigūruotas",
    };
  }

  const state = createOAuthState();
  const nonce = createNonce();
  persistOAuthLaunchContext({
    provider: "google",
    state,
    returnPath: opts.returnPath || "/",
    signupIntent: opts.signupIntent,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getWebAuthCallbackUrl(),
    response_type: "id_token",
    scope: "openid email profile",
    nonce,
    state,
    prompt: "select_account",
  });

  window.location.assign(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  return { status: "redirecting" };
}

/** Opens Google One Tap; resolves with ID token credential or null. */
export async function requestGoogleIdToken(): Promise<string | null> {
  const clientId = getGoogleClientId();
  if (!clientId) return null;

  // One Tap is unreliable inside Capacitor WebView — use renderGoogleButton instead.
  if (isNativeAuthEnvironment()) return null;

  await loadGoogleScript();
  assertAuthOrigin();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      resolve(token);
    };
    window.google!.accounts.id.initialize({
      client_id: clientId,
      callback: (res) => finish(res.credential ?? null),
      use_fedcm_for_prompt: true,
      auto_select: false,
    });
    window.google!.accounts.id.prompt((notification) => {
      if (
        notification?.isNotDisplayed?.() ||
        notification?.isSkippedMoment?.()
      ) {
        finish(null);
      }
    });
    setTimeout(() => finish(null), 8_000);
  });
}

export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (token: string) => void
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) return;
  await loadGoogleScript();
  assertAuthOrigin();
  window.google!.accounts.id.initialize({
    client_id: clientId,
    callback: (res) => {
      if (res.credential) onCredential(res.credential);
    },
    use_fedcm_for_button: true,
    use_fedcm_for_prompt: true,
  });
  container.innerHTML = "";
  window.google!.accounts.id.renderButton(container, {
    theme: "outline",
    size: "large",
    width: 320,
    locale: "lt",
  });
}

/**
 * Google sign-in with Incognito-safe fallback:
 * iOS / restricted → redirect; else One Tap → on fail redirect (web) or button (native).
 */
export async function startGoogleSignIn(opts?: {
  returnPath?: string;
  signupIntent?: "private" | "pro" | "wardrobe";
  forceRedirect?: boolean;
}): Promise<GoogleSignInOutcome> {
  const clientId = getGoogleClientId();
  if (!clientId || typeof window === "undefined") {
    return {
      status: "error",
      message: "Google prisijungimas dar neaktyvuotas",
    };
  }

  const returnPath =
    opts?.returnPath ||
    `${window.location.pathname}${window.location.search}` ||
    "/";

  if (isNativeAuthEnvironment()) {
    return { status: "needs_button" };
  }

  if (opts?.forceRedirect || prefersOAuthRedirectFlow()) {
    return startGoogleRedirectSignIn({
      returnPath,
      signupIntent: opts?.signupIntent,
    });
  }

  try {
    const token = await requestGoogleIdToken();
    if (token) return { status: "success", idToken: token };
  } catch {
    /* fall through to redirect */
  }

  // Incognito / FedCM / 3P-cookie blocks One Tap — full-page OAuth is reliable.
  return startGoogleRedirectSignIn({
    returnPath,
    signupIntent: opts?.signupIntent,
  });
}

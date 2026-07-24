import { getRuntimeAppleClientId } from "@/lib/api/config";
import {
  createOAuthState,
  getAppleRedirectUris,
  getWebAuthCallbackUrl,
  isNativeAuthEnvironment,
  persistOAuthLaunchContext,
  prefersOAuthRedirectFlow,
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
          nonce?: string;
          usePopup?: boolean;
          responseMode?: "query" | "fragment" | "form_post";
        }) => void;
        signIn: (config?: {
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => Promise<{
          authorization: { id_token: string; code?: string; state?: string };
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
  firstName?: string;
  lastName?: string;
}

export type AppleSignInOutcome =
  | { status: "success"; result: AppleSignInResult }
  | { status: "redirecting" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

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

function formatAppleName(user?: {
  email?: string;
  name?: { firstName?: string; lastName?: string };
}): Pick<AppleSignInResult, "email" | "name" | "firstName" | "lastName"> {
  const firstName = user?.name?.firstName?.trim() || undefined;
  const lastName = user?.name?.lastName?.trim() || undefined;
  const name =
    [firstName, lastName].filter(Boolean).join(" ").trim() || undefined;
  return {
    email: user?.email?.trim() || undefined,
    firstName,
    lastName,
    name,
  };
}

async function startAppleRedirectSignIn(opts: {
  returnPath: string;
  signupIntent?: "private" | "pro" | "wardrobe";
}): Promise<AppleSignInOutcome> {
  const clientId = getAppleClientId();
  if (!clientId || typeof window === "undefined") {
    return { status: "error", message: "Apple Client ID nesukonfigūruotas" };
  }

  const state = createOAuthState();
  persistOAuthLaunchContext({
    provider: "apple",
    state,
    returnPath: opts.returnPath || "/",
    signupIntent: opts.signupIntent,
  });

  await loadAppleScript();
  // Fragment mode keeps tokens out of server logs and works with static export
  // (Apple form_post POST cannot land on a static /auth/callback page).
  window.AppleID!.auth.init({
    clientId,
    scope: "name email",
    redirectURI: getAppleAuthRedirectUri(),
    state,
    usePopup: false,
    responseMode: "fragment",
  });

  // Navigates away — promise may never settle on iOS Safari.
  void window.AppleID!.auth.signIn({ state, usePopup: false }).catch(() => {
    /* redirect in progress or user cancelled after unload */
  });
  return { status: "redirecting" };
}

async function startApplePopupSignIn(): Promise<AppleSignInOutcome> {
  const clientId = getAppleClientId();
  if (!clientId || typeof window === "undefined") {
    return { status: "error", message: "Apple Client ID nesukonfigūruotas" };
  }

  await loadAppleScript();
  window.AppleID!.auth.init({
    clientId,
    scope: "name email",
    redirectURI: getAppleAuthRedirectUri(),
    usePopup: true,
  });

  try {
    const response = await window.AppleID!.auth.signIn({ usePopup: true });
    const idToken = response.authorization?.id_token;
    if (!idToken) {
      return {
        status: "error",
        message: "Nepavyko gauti Apple patvirtinimo",
      };
    }
    return {
      status: "success",
      result: {
        idToken,
        ...formatAppleName(response.user),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/popup|blocked|cancel/i.test(message)) {
      return { status: "cancelled" };
    }
    return { status: "cancelled" };
  }
}

/**
 * Sign in with Apple — redirect on iOS/WebKit (Safari blocks popups),
 * popup on desktop with automatic redirect fallback when the popup is blocked.
 */
export async function startAppleSignIn(opts?: {
  returnPath?: string;
  signupIntent?: "private" | "pro" | "wardrobe";
  forceRedirect?: boolean;
}): Promise<AppleSignInOutcome> {
  const clientId = getAppleClientId();
  if (!clientId || typeof window === "undefined") {
    return { status: "error", message: "Apple prisijungimas dar neaktyvuotas" };
  }
  if (isNativeAuthEnvironment()) {
    return {
      status: "error",
      message: "Programėlėje naudokite Apple per sistemos dialogą arba telefoną",
    };
  }

  const returnPath =
    opts?.returnPath ||
    (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/");

  const useRedirect = opts?.forceRedirect || prefersOAuthRedirectFlow();
  if (useRedirect) {
    return startAppleRedirectSignIn({
      returnPath,
      signupIntent: opts?.signupIntent,
    });
  }

  const popup = await startApplePopupSignIn();
  if (popup.status === "success") return popup;

  // Popup blocked / cancelled without token — fall back to seamless redirect.
  if (popup.status === "cancelled") {
    return startAppleRedirectSignIn({
      returnPath,
      signupIntent: opts?.signupIntent,
    });
  }
  return popup;
}

/** @deprecated Prefer startAppleSignIn for iOS Safari redirect support. */
export async function requestAppleIdToken(): Promise<AppleSignInResult | null> {
  const outcome = await startAppleSignIn({ forceRedirect: false });
  if (outcome.status === "success") return outcome.result;
  return null;
}

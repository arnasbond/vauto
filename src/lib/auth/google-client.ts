import { getRuntimeGoogleClientId } from "@/lib/api/config";
import {
  getAuthOrigin,
  getGoogleRedirectUris,
  isAllowedAuthOrigin,
  isNativeAuthEnvironment,
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
          }) => void;
          prompt: (cb?: (notification: { isNotDisplayed: () => boolean }) => void) => void;
          renderButton: (
            el: HTMLElement,
            cfg: { theme?: string; size?: string; width?: number }
          ) => void;
        };
      };
    };
  }
}

const SCRIPT_ID = "google-gsi-script";

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
      existing.addEventListener("error", () => reject(new Error("Google script failed")));
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

/** Opens Google One Tap / account picker; resolves with ID token credential. */
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
    });
    window.google!.accounts.id.prompt((notification) => {
      if (notification?.isNotDisplayed?.()) finish(null);
    });
    setTimeout(() => finish(null), 12_000);
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
  });
  container.innerHTML = "";
  window.google!.accounts.id.renderButton(container, {
    theme: "outline",
    size: "large",
    width: 320,
  });
}

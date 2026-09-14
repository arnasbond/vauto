/**
 * Native Authentication Adapter Abstraction for Android and iOS.
 *
 * Provides a canonical external-browser authentication bridge for Capacitor:
 * - Android: invokes system browser via VautoAndroid bridge.
 * - iOS: invokes system browser via VautoIos / webkit message handler or registered adapter.
 * - Missing adapter: fails closed (never falls through to embedded WebView).
 */

export interface NativeAuthAdapter {
  readonly platform: "android" | "ios";
  openExternalAuthUrl(url: string): boolean | Promise<boolean>;
}

let customAdapter: NativeAuthAdapter | null = null;

/**
 * Register a custom or test native auth adapter.
 * Pass null to restore default environment detection.
 */
export function registerNativeAuthAdapter(adapter: NativeAuthAdapter | null): void {
  customAdapter = adapter;
}

/**
 * Resolves the active native auth adapter for the current environment.
 * If running on Android or iOS and the platform bridge is available,
 * returns the corresponding adapter.
 * If no supported bridge is present, returns null (caller must fail closed).
 */
export function resolveNativeAuthAdapter(): NativeAuthAdapter | null {
  if (customAdapter) {
    return customAdapter;
  }

  if (typeof window === "undefined") {
    return null;
  }

  // 1. Android platform bridge
  const vautoAndroid = (
    window as unknown as {
      VautoAndroid?: { openExternalUrl: (url: string) => void };
    }
  ).VautoAndroid;

  if (vautoAndroid?.openExternalUrl && typeof vautoAndroid.openExternalUrl === "function") {
    return {
      platform: "android",
      openExternalAuthUrl(url: string): boolean {
        try {
          vautoAndroid.openExternalUrl(url);
          return true;
        } catch (err) {
          console.error("[VAUTO NativeAuth] Android openExternalUrl failed:", err);
          return false;
        }
      },
    };
  }

  // 2. iOS platform bridge
  const win = window as unknown as {
    VautoIos?: { openExternalUrl: (url: string) => void };
    webkit?: {
      messageHandlers?: {
        openExternalUrl?: { postMessage: (msg: unknown) => void };
      };
    };
  };

  if (win.VautoIos?.openExternalUrl && typeof win.VautoIos.openExternalUrl === "function") {
    return {
      platform: "ios",
      openExternalAuthUrl(url: string): boolean {
        try {
          win.VautoIos!.openExternalUrl(url);
          return true;
        } catch (err) {
          console.error("[VAUTO NativeAuth] iOS VautoIos.openExternalUrl failed:", err);
          return false;
        }
      },
    };
  }

  if (win.webkit?.messageHandlers?.openExternalUrl?.postMessage) {
    return {
      platform: "ios",
      openExternalAuthUrl(url: string): boolean {
        try {
          win.webkit!.messageHandlers!.openExternalUrl!.postMessage(url);
          return true;
        } catch (err) {
          console.error("[VAUTO NativeAuth] iOS webkit postMessage failed:", err);
          return false;
        }
      },
    };
  }

  // Missing or unsupported native adapter
  return null;
}

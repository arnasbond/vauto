import { Capacitor } from "@capacitor/core";

const LAUNCH_MARKER = "vauto_native_launch_v1";
const CRASH_COUNT = "vauto_native_crash_count_v1";
const STABLE_TIMER_MS = 6_000;

export function isNativePlatform(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** Wipe local app data after an unclean exit (fixes crash loops on Samsung / WebView). */
export async function wipeNativeAppStorage(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }

  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  if (!Capacitor.isNativePlatform()) return;

  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.clear();
  } catch {
    /* plugin unavailable */
  }
}

/**
 * Detect crash loop: if the previous session never reached "stable", reset storage.
 * Call once before rendering providers on native.
 */
export async function runNativeLaunchRecovery(): Promise<boolean> {
  if (!isNativePlatform()) return false;

  let wiped = false;

  try {
    const pending = sessionStorage.getItem(LAUNCH_MARKER) === "1";
    if (pending) {
      const crashes = Number(localStorage.getItem(CRASH_COUNT) || "0") + 1;
      localStorage.setItem(CRASH_COUNT, String(crashes));
      if (crashes >= 1) {
        await wipeNativeAppStorage();
        wiped = true;
        sessionStorage.setItem(LAUNCH_MARKER, "1");
        localStorage.removeItem(CRASH_COUNT);
      }
    } else {
      sessionStorage.setItem(LAUNCH_MARKER, "1");
    }
  } catch {
    sessionStorage.setItem(LAUNCH_MARKER, "1");
  }

  window.setTimeout(() => {
    try {
      sessionStorage.setItem(LAUNCH_MARKER, "0");
      localStorage.removeItem(CRASH_COUNT);
    } catch {
      /* ignore */
    }
  }, STABLE_TIMER_MS);

  return wiped;
}

export function hookNativeGlobalErrors(onFatal: () => void): () => void {
  if (!isNativePlatform()) return () => undefined;

  const onError = (event: ErrorEvent) => {
    console.error("[VAUTO native]", event.error ?? event.message);
    onFatal();
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    console.error("[VAUTO native unhandled]", event.reason);
    onFatal();
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

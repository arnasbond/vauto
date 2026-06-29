/**
 * Production web auto-update — polls remote version-config and soft-reloads when
 * the server versionCode advances past the build baked into this JS bundle.
 */
import { initDataApiConfig } from "@/lib/api/config";
import { subscribeAppVisibility } from "@/lib/app-visibility";
import { fetchVersionConfig } from "@/lib/app-version";
import { isNativeApp } from "@/lib/mobile-install";
import { WEB_BUILD_VERSION_CODE } from "@/lib/web-build-badge";

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const INITIAL_DELAY_MS = 20_000;
const RELOAD_COOLDOWN_MS = 120_000;
const RELOAD_SESSION_KEY = "vauto:web-update-reload";

let started = false;
let checking = false;
let reloading = false;

function isProductionWebClient(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return false;
  return !isNativeApp();
}

function canReloadNow(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_SESSION_KEY);
    if (!raw) return true;
    const last = Number(raw);
    return !Number.isFinite(last) || Date.now() - last >= RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markReloadAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_SESSION_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

async function checkForWebUpdate(): Promise<void> {
  if (!isProductionWebClient() || checking || reloading) return;

  checking = true;
  try {
    await initDataApiConfig();
    const remote = await fetchVersionConfig();
    if (remote.versionCode <= WEB_BUILD_VERSION_CODE) return;
    if (!canReloadNow()) {
      console.warn("[VAUTO web-update] reload suppressed (cooldown)", {
        boot: WEB_BUILD_VERSION_CODE,
        remote: remote.versionCode,
      });
      return;
    }

    reloading = true;
    markReloadAttempt();
    console.info("[VAUTO web-update] new version detected, reloading", {
      boot: WEB_BUILD_VERSION_CODE,
      remote: remote.versionCode,
      label: remote.latestVersion,
    });
    window.location.reload();
  } catch (e) {
    console.warn("[VAUTO web-update] check failed:", e);
  } finally {
    checking = false;
  }
}

/** Start background version polling for browser/PWA production clients. Idempotent. */
export function initWebAutoUpdate(): () => void {
  if (!isProductionWebClient() || started) return () => {};

  started = true;

  const initialTimer = window.setTimeout(
    () => void checkForWebUpdate(),
    INITIAL_DELAY_MS
  );
  const pollTimer = window.setInterval(
    () => void checkForWebUpdate(),
    POLL_INTERVAL_MS
  );
  const unsubVisibility = subscribeAppVisibility((foreground) => {
    if (foreground) void checkForWebUpdate();
  });

  return () => {
    window.clearTimeout(initialTimer);
    window.clearInterval(pollTimer);
    unsubVisibility();
    started = false;
  };
}

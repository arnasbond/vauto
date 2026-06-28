import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/mobile-install";

export interface VersionConfig {
  latestVersion: string;
  versionCode: number;
  downloadUrl: string;
}

export interface NativeVersionInfo {
  versionCode: number;
  versionName: string;
  source: "capacitor" | "injected" | "unknown";
}

declare global {
  interface Window {
    __VAUTO_NATIVE_VERSION__?: {
      versionCode: number;
      versionName: string;
    };
    VautoAndroid?: {
      openExternalUrl?: (url: string) => void;
    };
  }
}

export type AppVersionStatus =
  | "loading"
  | "current"
  | "outdated"
  | "web"
  | "error";

export interface AppVersionSnapshot {
  status: AppVersionStatus;
  isNativeShell: boolean;
  remote: VersionConfig | null;
  local: NativeVersionInfo | null;
  error?: string;
}

export async function fetchVersionConfig(): Promise<VersionConfig> {
  const res = await fetch(`/version-config.json?ts=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`version-config HTTP ${res.status}`);
  }
  const json = (await res.json()) as VersionConfig;
  if (!json.latestVersion || typeof json.versionCode !== "number") {
    throw new Error("version-config invalid schema");
  }
  return json;
}

function readInjectedNativeVersion(): NativeVersionInfo | null {
  if (typeof window === "undefined") return null;
  const injected = window.__VAUTO_NATIVE_VERSION__;
  if (
    injected &&
    typeof injected.versionCode === "number" &&
    typeof injected.versionName === "string"
  ) {
    return {
      versionCode: injected.versionCode,
      versionName: injected.versionName,
      source: "injected",
    };
  }
  return null;
}

/** Resolve APK shell version — Capacitor App.getInfo, then WebView injection fallback. */
export async function resolveNativeAppVersion(): Promise<NativeVersionInfo | null> {
  if (typeof window === "undefined" || !isNativeApp()) return null;

  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const versionCode = parseInt(info.build, 10);
      if (Number.isFinite(versionCode) && versionCode > 0) {
        return {
          versionCode,
          versionName: info.version,
          source: "capacitor",
        };
      }
    } catch (e) {
      console.warn("[VAUTO version] App.getInfo failed:", e);
    }
  }

  return readInjectedNativeVersion();
}

export function evaluateAppVersion(
  remote: VersionConfig | null,
  local: NativeVersionInfo | null,
  isNativeShell: boolean,
  error?: string
): AppVersionSnapshot {
  if (error) {
    return { status: "error", isNativeShell, remote, local, error };
  }
  if (!isNativeShell) {
    return { status: "web", isNativeShell, remote, local: null };
  }
  if (!remote || !local) {
    return {
      status: "error",
      isNativeShell,
      remote,
      local,
      error: "Nepavyko nustatyti vietinės arba gamybinės versijos",
    };
  }
  if (local.versionCode < remote.versionCode) {
    return { status: "outdated", isNativeShell, remote, local };
  }
  return { status: "current", isNativeShell, remote, local };
}

export async function openAppUpdateDownload(url: string): Promise<void> {
  if (typeof window === "undefined") return;

  const bridge = window.VautoAndroid?.openExternalUrl;
  if (typeof bridge === "function") {
    bridge(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

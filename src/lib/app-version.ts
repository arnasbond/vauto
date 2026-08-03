import { Capacitor } from "@capacitor/core";
import { isNativeApp } from "@/lib/mobile-install";
import { getDataApiBaseUrl } from "@/lib/api/config";

export interface VersionConfig {
  latestVersion: string;
  versionCode: number;
  downloadUrl: string;
  apkSizeBytes?: number;
  releaseNotesLt?: string;
  installHintLt?: string;
  forceUpdate?: boolean;
  minSupportedVersionCode?: number;
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
      clearWebViewCache?: () => void;
      promptMajorUpdate?: (versionLabel: string, downloadUrl: string) => void;
    };
  }
}

/** Major APK jump when remote versionCode exceeds local by more than one release. */
export const NATIVE_APK_MAJOR_GAP = 1;

export const DEFAULT_INSTALL_HINT_LT =
  "Atsisiuntę atidarykite vauto.apk → leiskite diegti iš nežinomų šaltinių → Įdiegti.";

export function formatApkSize(bytes?: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

export function versionCodeGap(
  localVersionCode: number,
  remoteVersionCode: number
): number {
  return remoteVersionCode - localVersionCode;
}

export function isMajorApkUpdateRequired(
  localVersionCode: number,
  remoteVersionCode: number,
  forceUpdate = false,
  minSupportedVersionCode?: number
): boolean {
  if (forceUpdate) return localVersionCode < remoteVersionCode;
  if (
    typeof minSupportedVersionCode === "number" &&
    localVersionCode < minSupportedVersionCode
  ) {
    return true;
  }
  return versionCodeGap(localVersionCode, remoteVersionCode) > NATIVE_APK_MAJOR_GAP;
}

export function isMinorApkDrift(
  localVersionCode: number,
  remoteVersionCode: number
): boolean {
  const gap = versionCodeGap(localVersionCode, remoteVersionCode);
  return gap > 0 && gap <= NATIVE_APK_MAJOR_GAP;
}

export type AppVersionStatus =
  | "loading"
  | "current"
  | "outdated_minor"
  | "outdated_major"
  | "web"
  | "error";

export interface AppVersionSnapshot {
  status: AppVersionStatus;
  isNativeShell: boolean;
  remote: VersionConfig | null;
  local: NativeVersionInfo | null;
  error?: string;
}

function normalizeVersionConfig(json: Partial<VersionConfig>): VersionConfig | null {
  if (!json.latestVersion || typeof json.versionCode !== "number") return null;
  return {
    latestVersion: json.latestVersion,
    versionCode: json.versionCode,
    downloadUrl:
      json.downloadUrl ||
      "https://www.vauto.lt/download/vauto.apk",
    apkSizeBytes:
      typeof json.apkSizeBytes === "number" ? json.apkSizeBytes : undefined,
    releaseNotesLt: json.releaseNotesLt,
    installHintLt: json.installHintLt || DEFAULT_INSTALL_HINT_LT,
    forceUpdate: Boolean(json.forceUpdate),
    minSupportedVersionCode:
      typeof json.minSupportedVersionCode === "number"
        ? json.minSupportedVersionCode
        : undefined,
  };
}

export async function fetchVersionConfig(): Promise<VersionConfig> {
  const apiBase = getDataApiBaseUrl();
  if (apiBase) {
    try {
      const res = await fetch(`${apiBase}/api/version?ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as VersionConfig;
        const normalized = normalizeVersionConfig(json);
        if (normalized) return normalized;
      }
    } catch {
      /* fallback to static manifest */
    }
  }

  const res = await fetch(`/version-config.json?ts=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`version-config HTTP ${res.status}`);
  }
  const json = (await res.json()) as VersionConfig;
  const normalized = normalizeVersionConfig(json);
  if (!normalized) {
    throw new Error("version-config invalid schema");
  }
  return normalized;
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
    if (
      isMajorApkUpdateRequired(
        local.versionCode,
        remote.versionCode,
        remote.forceUpdate,
        remote.minSupportedVersionCode
      )
    ) {
      return { status: "outdated_major", isNativeShell, remote, local };
    }
    return { status: "outdated_minor", isNativeShell, remote, local };
  }
  return { status: "current", isNativeShell, remote, local };
}

/** Invoke Android native AlertDialog for major APK updates (versionCode gap > 1). */
export function promptNativeMajorUpdate(
  versionLabel: string,
  downloadUrl: string
): boolean {
  if (typeof window === "undefined") return false;
  const bridge = window.VautoAndroid?.promptMajorUpdate;
  if (typeof bridge !== "function") return false;
  bridge(versionLabel, downloadUrl);
  return true;
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

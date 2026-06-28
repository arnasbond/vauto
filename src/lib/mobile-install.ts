import { Capacitor } from "@capacitor/core";
import {
  canUseCapacitorShare,
  shareViaCapacitor,
  type NativeSharePayload,
} from "@/lib/native-share";
import { SITE_URL } from "@/lib/social-share";
import { fetchVersionConfig } from "@/lib/app-version";

/** Primary browser download — Vercel rewrite proxies to GitHub release (no 404). */
export const APK_DOWNLOAD_URL = `${SITE_URL}/download/vauto.apk`;

/** Direct GitHub fallback (bookmark / share). */
export const APK_GITHUB_DOWNLOAD_URL =
  "https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk";

export const APK_RELEASE_PAGE =
  "https://github.com/arnasbond/vauto/releases/tag/android-latest";

/** iPhone PWA — atidaryti svetainę ir pridėti į pradžios ekraną. */
export const IOS_PWA_URL = SITE_URL;

export const INSTALL_PAGE_URL = `${SITE_URL}/install/`;

export type MobileInstallPlatform = "android" | "ios" | "other";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (Capacitor.isNativePlatform()) return true;
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return true;
  const bridge = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (bridge?.isNativePlatform?.() === true) return true;
  // Bundled Capacitor shell serves from https://localhost
  if (window.location.hostname === "localhost" && isAndroid()) return true;
  return false;
}

/**
 * Native WebView push (FCM) is disabled until google-services.json is wired in CI.
 * Prevents POST_NOTIFICATIONS crash / redirect loop after user taps Allow.
 */
export function isNativePushDisabled(): boolean {
  return isNativeApp();
}

export function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function getPreferredInstallPlatform(): MobileInstallPlatform {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "other";
}

export function getPrimaryDownloadUrl(): string {
  const platform = getPreferredInstallPlatform();
  if (platform === "android") return APK_DOWNLOAD_URL;
  if (platform === "ios") return INSTALL_PAGE_URL;
  return INSTALL_PAGE_URL;
}

export function getPrimaryReleasePage(): string {
  const platform = getPreferredInstallPlatform();
  if (platform === "android") return APK_RELEASE_PAGE;
  return INSTALL_PAGE_URL;
}

export function shouldShowInstallPrompt(): boolean {
  return isMobileDevice() && !isNativeApp() && !isInstalledPwa();
}

let apkDownloadInFlight = false;

/** One-shot APK download — uses version-config URL with cache bust. */
export async function startApkDownload(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNativeApp()) return;
  if (apkDownloadInFlight) return;

  apkDownloadInFlight = true;
  window.setTimeout(() => {
    apkDownloadInFlight = false;
  }, 15_000);

  let url = APK_DOWNLOAD_URL;
  try {
    const cfg = await fetchVersionConfig();
    url = cfg.downloadUrl || APK_DOWNLOAD_URL;
  } catch {
    url = APK_GITHUB_DOWNLOAD_URL;
  }

  const sep = url.includes("?") ? "&" : "?";
  window.location.assign(`${url}${sep}ts=${Date.now()}`);
}

async function shareInstallPackage(payload: NativeSharePayload): Promise<boolean> {
  if (canUseCapacitorShare()) {
    const ok = await shareViaCapacitor(payload);
    if (ok) return true;
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(payload.url);
    return true;
  } catch {
    return false;
  }
}

export async function shareAndroidApk(): Promise<boolean> {
  if (isNativeApp()) return false;
  return shareInstallPackage({
    title: "Vauto Android programėlė",
    text: "Atsisiųsk Vauto APK — lietuviška išmani skelbimų programėlė visoje Lietuvoje.",
    url: APK_GITHUB_DOWNLOAD_URL,
    dialogTitle: "Dalintis APK",
  });
}

export async function shareIosPwa(): Promise<boolean> {
  return shareInstallPackage({
    title: "Vauto iPhone",
    text: "Atidaryk Safari → Pridėti į pradžios ekraną. VAUTO — skelbimai visoje Lietuvoje.",
    url: INSTALL_PAGE_URL,
    dialogTitle: "Dalintis su iPhone vartotoju",
  });
}

export async function sharePreferredInstallPackage(): Promise<boolean> {
  const platform = getPreferredInstallPlatform();
  if (platform === "ios") return shareIosPwa();
  if (platform === "android") return shareAndroidApk();
  return shareAndroidApk();
}

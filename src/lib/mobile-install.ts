import { Capacitor } from "@capacitor/core";
import {
  canUseCapacitorShare,
  shareViaCapacitor,
  type NativeSharePayload,
} from "@/lib/native-share";

/** Stable URL for the latest Android APK (GitHub Releases). */
export const APK_DOWNLOAD_URL =
  "https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk";

export const APK_RELEASE_PAGE =
  "https://github.com/arnasbond/vauto/releases/tag/android-latest";

/** Stable URL for the latest iOS IPA (GitHub Releases, unsigned fallback). */
export const IOS_DOWNLOAD_URL =
  "https://github.com/arnasbond/vauto/releases/download/ios-latest/vauto.ipa";

/** Ad-hoc OTA install page (signed IPA, registered UDIDs only). */
export const IOS_OTA_INSTALL_URL = "https://vauto-chi.vercel.app/ios/install.html";

/** Ad-hoc signed IPA direct download. */
export const IOS_ADHOC_DOWNLOAD_URL =
  "https://github.com/arnasbond/vauto/releases/download/ios-adhoc-latest/vauto-adhoc.ipa";

export const IOS_RELEASE_PAGE =
  "https://github.com/arnasbond/vauto/releases/tag/ios-latest";

/**
 * TestFlight public invite link — set in Vercel after first external test group.
 * Example: https://testflight.apple.com/join/AbCdEfGh
 */
export const IOS_TESTFLIGHT_URL =
  (typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_IOS_TESTFLIGHT_URL?.trim()) ||
  "";

export type MobileInstallPlatform = "android" | "ios" | "other";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
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
  if (platform === "ios") return getIosInstallUrl();
  if (platform === "android") return APK_DOWNLOAD_URL;
  return "/install/";
}

/** Best iOS install URL: TestFlight → OTA → unsigned IPA. */
export function getIosInstallUrl(): string {
  if (IOS_TESTFLIGHT_URL) return IOS_TESTFLIGHT_URL;
  return IOS_OTA_INSTALL_URL;
}

export function getIosDirectDownloadUrl(): string {
  if (IOS_TESTFLIGHT_URL) return IOS_TESTFLIGHT_URL;
  return IOS_ADHOC_DOWNLOAD_URL;
}

export function hasTestFlightLink(): boolean {
  return IOS_TESTFLIGHT_URL.length > 0;
}

export function getPrimaryReleasePage(): string {
  const platform = getPreferredInstallPlatform();
  if (platform === "ios") return IOS_RELEASE_PAGE;
  if (platform === "android") return APK_RELEASE_PAGE;
  return "/install/";
}

export function shouldShowInstallPrompt(): boolean {
  return isMobileDevice() && !isNativeApp() && !isInstalledPwa();
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
  return shareInstallPackage({
    title: "Vauto Android programėlė",
    text: "Atsisiųsk Vauto APK — lietuviška išmani skelbimų programėlė visoje Lietuvoje.",
    url: APK_DOWNLOAD_URL,
    dialogTitle: "Dalintis APK",
  });
}

export async function shareIosApp(): Promise<boolean> {
  const url = getIosInstallUrl();
  const viaTestFlight = hasTestFlightLink();
  return shareInstallPackage({
    title: viaTestFlight ? "Vauto TestFlight (iPhone)" : "Vauto iOS programėlė (iPhone)",
    text: viaTestFlight
      ? "Prisijunk prie Vauto per TestFlight — lietuviška išmani skelbimų ekosistema."
      : "Atsisiųsk Vauto iPhone programėlę — lietuviška išmani skelbimų ekosistema.",
    url,
    dialogTitle: viaTestFlight ? "Dalintis TestFlight" : "Dalintis iOS programėle",
  });
}

export async function sharePreferredInstallPackage(): Promise<boolean> {
  const platform = getPreferredInstallPlatform();
  if (platform === "ios") return shareIosApp();
  if (platform === "android") return shareAndroidApk();
  return shareAndroidApk();
}

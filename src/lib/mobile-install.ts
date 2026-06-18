import { Capacitor } from "@capacitor/core";

/** Stable URL for the latest Android APK (GitHub Releases). */
export const APK_DOWNLOAD_URL =
  "https://github.com/arnasbond/vauto/releases/download/android-latest/vauto.apk";

export const APK_RELEASE_PAGE =
  "https://github.com/arnasbond/vauto/releases/tag/android-latest";

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

export function shouldShowInstallPrompt(): boolean {
  return isMobileDevice() && !isNativeApp() && !isInstalledPwa();
}

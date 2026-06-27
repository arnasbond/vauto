import { Capacitor } from "@capacitor/core";
import { APK_DOWNLOAD_URL, APK_GITHUB_DOWNLOAD_URL, APK_RELEASE_PAGE } from "@/lib/mobile-install";

const BLOCKED_PREFIXES = [
  APK_DOWNLOAD_URL,
  APK_GITHUB_DOWNLOAD_URL,
  APK_RELEASE_PAGE,
  "https://github.com/arnasbond/vauto/releases/",
  "/download/vauto.apk",
  "/download/vauto.vercel.apk",
];

function isBlockedInstallUrl(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    const normalized = url.href.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (path.includes("/download/vauto") && path.endsWith(".apk")) return true;
    return BLOCKED_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()))
      || (normalized.includes("github.com") && normalized.includes(".apk"));
  } catch {
    return false;
  }
}

/** Stop APK / GitHub release links from leaving the WebView (login ghost-tap). */
export function attachNativeInstallLinkBlocker(): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
    if (!isBlockedInstallUrl(anchor.href)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

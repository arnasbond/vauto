import { Capacitor } from "@capacitor/core";
import { APK_DOWNLOAD_URL, APK_GITHUB_DOWNLOAD_URL, APK_RELEASE_PAGE } from "@/lib/mobile-install";

const BLOCKED_PREFIXES = [
  APK_DOWNLOAD_URL,
  APK_GITHUB_DOWNLOAD_URL,
  APK_RELEASE_PAGE,
  "https://github.com/arnasbond/vauto/releases/",
];

const BLOCKED_FRAGMENTS = [
  "github",
  "usercontent",
  "render.com",
  ".apk",
  "vauto.apk",
  "/download/vauto",
];

function isBlockedInstallUrl(href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    const haystack = `${url.href} ${url.pathname}`.toLowerCase();
    return (
      BLOCKED_FRAGMENTS.some((fragment) => haystack.includes(fragment)) ||
      BLOCKED_PREFIXES.some((prefix) => url.href.toLowerCase().startsWith(prefix.toLowerCase()))
    );
  } catch {
    return false;
  }
}

/** Stop APK / GitHub CDN links from leaving the WebView (login ghost-tap). */
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

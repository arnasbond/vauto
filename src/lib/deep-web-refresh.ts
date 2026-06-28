/**
 * Pull-to-refresh deep hot-reload — purges SW + Cache Storage + WebView disk cache,
 * then forces a network reload so Vercel web updates land without a new APK.
 */
export async function performDeepWebRefresh(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    window.VautoAndroid?.clearWebViewCache?.();
  } catch {
    /* native bridge optional */
  }

  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }

  forceHardNetworkReload();
}

/** Bypass WebView HTTP/disk cache — reload(true) where supported, else cache-busted navigation. */
export function forceHardNetworkReload(): void {
  if (typeof window === "undefined") return;

  try {
    const reloadWithCacheBypass = (
      window.location as Location & { reload: (forcedReload?: boolean) => void }
    ).reload;
    reloadWithCacheBypass.call(window.location, true);
    return;
  } catch {
    /* fall through */
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_vauto_reload", String(Date.now()));
  window.location.replace(url.toString());
}

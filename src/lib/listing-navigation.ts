import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Canonical add-listing routes used by web and Capacitor WebView. */
export function resolveAddListingPath(fashion = false): string {
  return fashion ? "/add?vertical=fashion" : "/add";
}

export function resolveFashionPortalPath(): string {
  return "/fashion";
}

export function pushAddListing(router: AppRouterInstance, fashion = false): void {
  router.push(resolveAddListingPath(fashion));
}

export function isOnAddListingPath(fashion?: boolean): boolean {
  if (typeof window === "undefined") return false;
  const current = window.location.pathname.replace(/\/$/, "") || "/";
  if (current !== "/add") return false;
  if (fashion === undefined) return true;
  const params = new URLSearchParams(window.location.search);
  return fashion
    ? params.get("vertical") === "fashion"
    : params.get("vertical") !== "fashion";
}

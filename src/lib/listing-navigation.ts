import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Canonical entry for new listings — AI seller chat on home (or fashion).
 * Legacy /add still redirects into the same flow for old bookmarks.
 */
export function resolveAddListingPath(fashion = false): string {
  return fashion ? "/fashion/" : "/";
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
  // Seller flow now lives on home / fashion; /add is a redirect shim.
  if (current === "/add") return true;
  if (fashion === true) return current === "/fashion";
  if (fashion === false) return current === "/";
  return current === "/" || current === "/fashion" || current === "/add";
}

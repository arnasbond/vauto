import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * R5 final — canonical entry for new listings: a STANDALONE manual form on
 * `/add` (fashion keeps its wardrobe flow). The AI seller chat is a separate
 * assistant surface, never a mandatory intermediary for creating a listing.
 */
export function resolveAddListingPath(fashion = false): string {
  return fashion ? "/fashion/" : "/add";
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
  if (current === "/add") return true;
  if (fashion === true) return current === "/fashion";
  return false;
}

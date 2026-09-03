/**
 * F8 — listing cache-header policy (single source, unit-tested).
 *
 * PUBLIC caching applies ONLY to successful 200 responses of the public
 * feed endpoints. Every error status (400/404/5xx) and every authenticated
 * endpoint must be `no-store` — a user-specific or failed response must
 * never be cached and served to another visitor.
 */
export const LISTING_FEED_CACHE = "public, max-age=30, stale-while-revalidate=300";
export const LISTING_SINGLE_CACHE = "public, max-age=60, stale-while-revalidate=3600";
export const NO_STORE = "no-store";

export function cachePolicyForStatus(policy: string, status: number): string {
  if (status >= 200 && status < 300) return policy;
  return NO_STORE;
}

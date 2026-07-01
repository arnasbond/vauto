import type { Page, Locator } from "@playwright/test";

/** Marketplace results anchor (sr-only heading + filter bar). */
export function listingResults(page: Page): Locator {
  return page.locator("#listing-results");
}

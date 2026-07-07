import { expect, type Page } from "@playwright/test";
import { listingResults } from "./listing-results";

/** Supervisor chat strip — single broker bubble per turn. */
export function agentChatStrip(page: Page) {
  return page.locator(".agent-chat-strip");
}

/**
 * Assert post-search clean UI: blank search bar, no legacy empathy banners,
 * single supervisor broker strip (not stacked fallbacks in #listing-results).
 */
export async function expectCleanSupervisorSearch(page: Page) {
  const search = page.getByRole("searchbox").first();
  const results = listingResults(page);

  await expect(results.getByText(/^Ieškoma…$/)).toBeHidden({ timeout: 45_000 });

  await expect(search).toHaveValue("", { timeout: 45_000 });

  await expect(results.getByText(/Šiuo metu.*turguje neradau/i)).toHaveCount(0);
  await expect(results.getByText(/Deje, pagal/i)).toHaveCount(0);
  await expect(results.getByText(/0 rezultat/i)).toHaveCount(0);

  const strip = agentChatStrip(page);
  await expect(strip).toBeVisible({ timeout: 45_000 });
  await expect(strip).toHaveAttribute("aria-label", "VAUTO asistento atsakymas");

  await expect(strip.getByText(/Šiuo metu.*turguje neradau/i)).toHaveCount(0);
  await expect(strip.getByText(/Deje, nieko neradau/i)).toHaveCount(0);
}

/** Filter bar shows Lithuania-wide count after supervisor clears the query bar. */
export async function expectMarketplaceResultSummary(page: Page) {
  const results = listingResults(page);
  await expect(results.getByText(/Skelbimai Lietuvoje:.*rezultat/i)).toBeVisible({
    timeout: 45_000,
  });
}

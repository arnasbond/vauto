import { expect, type Page, type Route } from "@playwright/test";
import { listingResults } from "./listing-results";

/** Supervisor chat strip — single broker bubble per turn. */
export function agentChatStrip(page: Page) {
  return page.locator(".agent-chat-strip");
}

const SEARCH_MOCKS = {
  bmw: {
    listingIds: ["lt-auto-001", "lt-auto-002"],
    reply: "Radau kelis BMW variantus — peržiūrėkite tinklelyje.",
  },
  volvo: {
    listingIds: ["lt-auto-016"],
    reply: "Radau Volvo V70 variantus — peržiūrėkite tinklelyje.",
  },
} as const;

export type SupervisorSearchMockVariant = keyof typeof SEARCH_MOCKS;

/** Deterministic supervisor search — avoids live Render latency in static E2E. */
export async function installSupervisorSearchMocks(
  page: Page,
  variant: SupervisorSearchMockVariant
) {
  const spec = SEARCH_MOCKS[variant];
  const agentResult = {
    ok: true,
    reply: spec.reply,
    actions: {
      type: "search",
      listingIds: spec.listingIds,
      searchQuery: variant === "bmw" ? "bmw" : "volvo v70",
    },
    toolCalls: [],
  };

  const streamBody = `data: ${JSON.stringify({
    type: "final",
    result: agentResult,
  })}\n\n`;

  const fulfillAgent = async (route: Route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    if (url.includes("/stream")) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        body: streamBody,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(agentResult),
    });
  };

  await page.route("**/api/vauto-agent**", fulfillAgent);
  await page.route("**/vauto-api.onrender.com/api/vauto-agent**", fulfillAgent);
}

/**
 * Assert post-search clean UI: blank search bar, no legacy empathy banners,
 * single supervisor broker strip (not stacked fallbacks in #listing-results).
 */
export async function expectCleanSupervisorSearch(page: Page) {
  const search = page.getByRole("searchbox").first();
  const results = listingResults(page);

  await expect(results.getByText(/^Ieškoma…$/)).toBeHidden({ timeout: 20_000 });

  await expect(search).toHaveValue("", { timeout: 20_000 });

  await expect(results.getByText(/Šiuo metu.*turguje neradau/i)).toHaveCount(0);
  await expect(results.getByText(/Deje, pagal/i)).toHaveCount(0);
  await expect(results.getByText(/0 rezultat/i)).toHaveCount(0);

  const strip = agentChatStrip(page);
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await expect(strip).toHaveAttribute("aria-label", "VAUTO asistento atsakymas");

  await expect(strip.getByText(/Šiuo metu.*turguje neradau/i)).toHaveCount(0);
  await expect(strip.getByText(/Deje, nieko neradau/i)).toHaveCount(0);
}

/** Filter bar shows Lithuania-wide count after supervisor clears the query bar. */
export async function expectMarketplaceResultSummary(page: Page) {
  const results = listingResults(page);
  await expect(results.getByText(/Skelbimai Lietuvoje:.*rezultat/i)).toBeVisible({
    timeout: 20_000,
  });
}

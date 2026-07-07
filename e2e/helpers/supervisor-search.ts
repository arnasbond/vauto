import { expect, type Page, type Route } from "@playwright/test";
import { listingResults } from "./listing-results";

const SEARCH_MOCKS = {
  bmw: {
    listingIds: ["lt-auto-001", "lt-auto-002"],
    reply: "Radau kelis BMW variantus — peržiūrėkite tinklelyje.",
    searchQuery: "bmw 320d",
  },
  volvo: {
    listingIds: ["lt-auto-016"],
    reply: "Radau Volvo V70 variantus — peržiūrėkite tinklelyje.",
    searchQuery: "volvo v70",
  },
} as const;

export type SupervisorSearchMockVariant = keyof typeof SEARCH_MOCKS;

function buildAgentResult(variant: SupervisorSearchMockVariant) {
  const spec = SEARCH_MOCKS[variant];
  return {
    ok: true,
    reply: spec.reply,
    actions: {
      type: "search",
      listingIds: spec.listingIds,
      searchQuery: spec.searchQuery,
    },
    toolCalls: [],
  };
}

async function fulfillAgentRoute(route: Route, agentResult: ReturnType<typeof buildAgentResult>) {
  if (route.request().method() !== "POST") {
    await route.continue();
    return;
  }
  const url = route.request().url();
  if (url.includes("/stream")) {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: `data: ${JSON.stringify({ type: "final", result: agentResult })}\n\n`,
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(agentResult),
  });
}

/**
 * Stub supervisor agent search for static E2E — conductor off, deterministic listing pins.
 */
export async function installSupervisorSearchMocks(
  page: Page,
  variant: SupervisorSearchMockVariant
) {
  const agentResult = buildAgentResult(variant);

  await page.route("**/runtime-config.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiUrl: "https://vauto-api.onrender.com",
        conductorEnabled: false,
      }),
    });
  });

  await page.route("**/api/vauto-agent**", (route) => fulfillAgentRoute(route, agentResult));
}

/**
 * Post-search clean UI: blank search bar, no deleted empathy banners in #listing-results,
 * Lithuania-wide result summary (query label cleared after supervisor sync).
 */
export async function expectCleanSupervisorSearch(page: Page) {
  const search = page.getByRole("searchbox").first();
  const results = listingResults(page);

  await expect(results.getByText(/^Ieškoma…$/)).toBeHidden({ timeout: 30_000 });
  await expect(search).toHaveValue("", { timeout: 30_000 });

  await expect(results.getByText(/Šiuo metu.*turguje neradau/i)).toHaveCount(0);
  await expect(results.getByText(/Deje, pagal/i)).toHaveCount(0);
  await expect(results.getByText(/Deje, nieko neradau/i)).toHaveCount(0);
  await expect(results.getByText(/0 rezultat/i)).toHaveCount(0);

  // Legacy fallback lived inside the results region — not duplicated after supervisor sync.
  await expect(results.locator(".agent-chat-strip")).toHaveCount(0);
}

/** Filter bar shows Lithuania-wide count after supervisor clears the query bar. */
export async function expectMarketplaceResultSummary(page: Page) {
  const results = listingResults(page);
  await expect(results.getByText(/Skelbimai Lietuvoje:.*rezultat/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(results.getByText(/^(bmw|volvo).*rezultat/i)).toHaveCount(0);
}

export function supervisorSearchQuery(variant: SupervisorSearchMockVariant): string {
  return SEARCH_MOCKS[variant].searchQuery;
}

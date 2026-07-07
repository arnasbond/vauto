import { expect, type Page } from "@playwright/test";
import { listingResults } from "./listing-results";

/** Supervisor chat strip — single broker bubble per turn. */
export function agentChatStrip(page: Page) {
  return page.locator(".agent-chat-strip");
}

const SEARCH_MOCKS = {
  bmw: {
    listingIds: ["lt-auto-001", "lt-auto-002"],
    reply: "Radau kelis BMW variantus — peržiūrėkite tinklelyje.",
    searchQuery: "bmw",
  },
  volvo: {
    listingIds: ["lt-auto-016"],
    reply: "Radau Volvo V70 variantus — peržiūrėkite tinklelyje.",
    searchQuery: "volvo v70",
  },
} as const;

export type SupervisorSearchMockVariant = keyof typeof SEARCH_MOCKS;

/** Deterministic supervisor search — stubs fetch before static serve can return SPA HTML. */
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
      searchQuery: spec.searchQuery,
    },
    toolCalls: [],
  };

  await page.addInitScript((mock) => {
    const streamBody = `data: ${JSON.stringify({
      type: "final",
      result: mock,
    })}\n\n`;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (!url.includes("/api/vauto-agent")) {
        return originalFetch(input, init);
      }
      if (url.includes("/stream")) {
        return new Response(streamBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream; charset=utf-8" },
        });
      }
      return new Response(JSON.stringify(mock), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
  }, agentResult);
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

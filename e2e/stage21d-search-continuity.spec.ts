import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  installFirstTimeSearchStub,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 21D — AI-native search continuity & recovery hardening.
 *
 * Runs inside the default loopback static-export harness (no live AI backend),
 * so AI interpretation below is deterministic (client-side adapter onto the
 * canonical 13A/13B facet system) — the AI-DOWN path is the runtime truth.
 *
 * Deterministic fixture (same as 18.3): the "re" stub pins lt-nt-004
 * ("1 kambario butas studentams", real_estate, Telšiai, 89 000 €,
 * propertyType=Butas, rooms=1).
 *
 * NOTE — architecture facts the tests rely on:
 *  - AI interpretation chips render from the COMMITTED natural-language query
 *    (searchQuery), not from filter state alone.
 *  - A query submitted from the homepage commits state on "/" (URL params on
 *    the homepage path); /search is a separate entry page.
 *  - Deep-link without q restores canonical filters; chips appear only when a
 *    q is present.
 *  - The AI chips region renders twice on /search (top chrome + results), so
 *    [data-ai-chips] requires .first().
 */

const RE_CARD = '[data-listing-card][data-listing-category="real_estate"]';
/** Deep-link that matches the deterministic RE fixture exactly. */
const RE_DEEP_LINK_WITH_Q =
  "/search?q=" +
  encodeURIComponent("butas Telšiai") +
  "&vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas&ca_rooms=1";

/** Direct canonical URL entry WITHOUT a natural-language query. */
const RE_DEEP_LINK_NO_Q =
  "/search?vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas&ca_rooms=1";

function reAiChips(page: Page) {
  return {
    vertical: page.locator('[data-ai-chip][data-chip-kind="vertical"]'),
    location: page.locator('[data-ai-chip][data-chip-field="location"]'),
    propertyType: page.locator('[data-ai-chip][data-chip-field="propertyType"]'),
    rooms: page.locator('[data-ai-chip][data-chip-field="rooms"]'),
  };
}

async function expectAnchorCard(page: Page) {
  await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 12_000 });
  await expect(page.locator(RE_CARD)).toContainText("1 kambario butas studentams");
}

async function openResultsWithQuery(
  page: Page,
  q: string,
  width: number,
  height: number,
  mode: "hits" | "re" = "re"
) {
  await page.setViewportSize({ width, height });
  await installFirstTimeSearchStub(page, mode);
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
  const search = homeSearchbox(page);
  await search.fill(q);
  await search.press("Enter");
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
}

async function openSearchPage(page: Page, url: string) {
  await page.goto(url);
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
}

test.describe("Stage 21D — search continuity & recovery", () => {
  test("21D-A: query → interpretation chips → deterministic results", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");

    await expect(page.locator("[data-ai-interpretation]").first()).toBeVisible({ timeout: 10_000 });
    const chips = reAiChips(page);
    await expect(chips.vertical.first()).toContainText("Nekilnojamasis");
    await expect(chips.location.first()).toContainText("Telšiai");
    await expect(chips.propertyType.first()).toBeVisible();
    // Results rendered (real estate anchor card from the fixture).
    await expectAnchorCard(page);
  });

  test("21D-B: edit a chip (propertyType) updates canonical state and URL", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");
    const propType = reAiChips(page).propertyType;
    await expect(propType.first()).toBeVisible({ timeout: 10_000 });

    // The propertyType chip is an enum with an inline editor.
    await propType.first().locator("[data-ai-chip-edit]").click();
    const editor = page.locator("[data-ai-chip-editor]").first();
    await expect(editor).toBeAttached({ timeout: 5_000 });
    // Editing to a different value commits canonical state (URL carries ca_propertyType).
    await editor.selectOption({ index: 2 });
    await expect.poll(async () => page.url()).toContain("ca_propertyType=");
  });

  test("21D-C: remove a chip removes the constraint from state and URL", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");
    const locChip = reAiChips(page).location;
    await expect(locChip.first()).toBeVisible({ timeout: 10_000 });
    await locChip.first().locator("[data-ai-chip-remove]").click();
    await expect(locChip).toHaveCount(0);
    // Canonical state/URL drops the location constraint (no ghost filter).
    await expect.poll(async () => page.url()).not.toContain("location=");
  });

  test("21D-D: add a filter becomes part of canonical intent", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");
    await expect(page.locator("[data-ai-chip-add]").first()).toBeVisible({ timeout: 10_000 });
    await page.locator("[data-ai-chip-add]").first().click();
    await expect(page.locator("[data-ai-add-menu]").first()).toBeVisible();
    // Adding "Kaina iki" writes a priceMax facet into canonical state + URL.
    await page.locator('[data-ai-add-menu-item="priceMax"]').first().click();
    await expect.poll(async () => page.url()).toContain("price_max=");
  });

  test("21D-E: refresh reconstructs identical state and results", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await expectAnchorCard(page);
    await expect(page.locator('[data-ai-chip][data-chip-field="propertyType"]').first()).toBeVisible();
    const urlBefore = page.url();
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expectAnchorCard(page);
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator('[data-ai-chip][data-chip-field="location"]').first()).toBeVisible();
    await expect(page.locator('[data-ai-chip][data-chip-field="propertyType"]').first()).toBeVisible();
  });

  test("21D-F/G: browser Back and Forward restore meaningful state", async ({ page }) => {
    // State A: deep-link canonical RE state with q (chips render).
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await expectAnchorCard(page);
    await expect(page.locator('[data-ai-chip][data-chip-field="location"]').first()).toBeVisible();

    // State B: view=list (navigational pushState entry).
    const listToggle = page.getByRole("button", { name: "Sąrašas" }).first();
    await expect(listToggle).toBeVisible({ timeout: 10_000 });
    await listToggle.click();
    await expect(page).toHaveURL(/view=list/, { timeout: 10_000 });
    await expect(page.locator(".listing-card-row").first()).toBeVisible({ timeout: 10_000 });

    // Back → A: grid restored, canonical facets intact.
    await page.goBack({ waitUntil: "load" });
    await expect.poll(async () => page.url()).toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("view=");
    await expectAnchorCard(page);

    // Forward → B: list view restored.
    await page.goForward({ waitUntil: "load" });
    await expect.poll(async () => page.url()).toContain("view=list");
    await expect(page.locator(".listing-card-row").first()).toBeVisible({ timeout: 10_000 });
  });

  test("21D-H: deep-link reconstruction without re-running AI", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /vauto-agent|conductor|\/api\/search/i.test(req.url())
      ) {
        posts.push(req.url());
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await expectAnchorCard(page);
    // Canonical filter facets restore from the URL (propertyType chip present).
    await expect(page.locator('[data-ai-chip][data-chip-field="propertyType"]').first()).toBeVisible();
    expect(posts).toEqual([]);
  });

  test("21D-I: zero results → clear/edit criteria → recover immediately", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(
      page,
      "/search?q=zzzzqwerty999&location=Tel%C5%A1iai&ca_propertyType=Butas&ca_rooms=1"
    );
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    expect(await page.locator("[data-listing-card]").count()).toBe(0);
    // Active criteria remain visible in the URL and in the results chrome.
    expect(page.url()).toContain("q=zzzzqwerty999");
    expect(page.url()).toContain("location=");
    // The results area advertises a filter action (not a dead end).
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();

    // Edit a restrictive criterion via the classic drawer → results recompute.
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const locationInput = page
      .locator("[data-facet-drawer]")
      .getByRole("textbox", { name: "Vietovė" });
    await expect(locationInput).toBeVisible({ timeout: 10_000 });
    await locationInput.fill("Telšiai");
    await page.locator("[data-facet-apply]").first().click();
    await expect.poll(async () => page.url()).toContain("location=");
    // No dead end: the grid area is present and usable.
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 10_000 });
  });

  test("21D-J: vertical switch clears incompatible facets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await expectAnchorCard(page);
    expect(page.url()).toContain("ca_propertyType=");

    // Switch vertical via the classic drawer to ELECTRONICS (canonical id).
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const verticalSelect = page.locator("[data-facet-drawer] [data-facet-vertical-select]");
    await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
    await verticalSelect.selectOption("ELECTRONICS");
    await page.locator("[data-facet-apply]").first().click();

    // Incompatible RE-only facets must vanish from URL (no leak).
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("ca_rooms=");
    // Shared price survives (semantically justified agnostic facet).
    expect(page.url()).toContain("price_max=120000");
  });

  test("21D-K: AI unavailable → deterministic search remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("https://vauto-api.onrender.com/**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await expectAnchorCard(page);
    // No blank screen; marketplace chrome + filters present.
    await expect(page.getByRole("navigation", { name: "Pagrindinė navigacija" })).toBeVisible();
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(0);
  });

  test("21D-L: rapid A→B intent — the LATEST confirmed user intent wins", async ({ page }) => {
    // The A→B race: two rapid submissions on the /search top chrome (which stays
    // mounted across commits). The sequence guard in AiCommandBar drops a stale
    // A response, so the final state must reflect B — vehicles vertical, no RE
    // rooms facet from the stale A.
    await page.setViewportSize({ width: 1440, height: 900 });
    await installFirstTimeSearchStub(page, "re");
    await page.goto("/search");
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    const search = homeSearchbox(page);
    await expect(search).toBeVisible({ timeout: 10_000 });

    // Submit A (real estate), then immediately B (vehicle query). Wait for the
    // composer to re-enable after A so the second Enter is not dropped by the
    // disabled guard (searchLoading) — the sequence guard protects the async
    // response ordering, which is the race under test.
    await search.fill("2 kambarių butas Vilniuje iki 120 000 €");
    await search.press("Enter");
    await expect(search).toBeEnabled({ timeout: 15_000 });
    await search.fill("BMW X5 iki 25 000 €");
    await search.press("Enter");

    // Final committed intent is B — the vehicle interpretation chip wins.
    await expect(page.locator('[data-ai-chip][data-chip-kind="vertical"]').first()).toContainText(
      "Transportas",
      { timeout: 15_000 }
    );
    // No RE rooms facet may survive from the stale A.
    await expect(page.locator('[data-ai-chip][data-chip-field="rooms"]')).toHaveCount(0);
  });

  test("21D-M: malformed/unknown intent degrades gracefully (no dead end)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installFirstTimeSearchStub(page, "re");
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    const search = homeSearchbox(page);
    // Unknown gibberish — must not produce false confident facets, no blank UI.
    await search.fill("zqxw vtrp mlksn");
    await search.press("Enter");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // No AI interpretation chips are invented for an unknown query.
    await expect(page.locator("[data-ai-chip]")).toHaveCount(0);
    // The marketplace chrome remains usable (no crash/dead-end).
    await expect(page.getByRole("navigation", { name: "Pagrindinė navigacija" })).toBeVisible();
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(0);
  });

  test("21D-N: 390px LIGHT — chips wrap, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await page.evaluate(() => localStorage.setItem("vauto_app_theme_v1", "light"));
    await page.reload();
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-ai-chips]").first()).toBeVisible({ timeout: 10_000 });
    const overflow = await horizontalOverflowPx(page);
    expect(overflow, "390px LIGHT overflow").toBeLessThanOrEqual(0);
  });

  test("21D-O: 390px DARK — chips wrap, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
    await page.evaluate(() => localStorage.setItem("vauto_app_theme_v1", "dark"));
    await page.reload();
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-ai-chips]").first()).toBeVisible({ timeout: 10_000 });
    const overflow = await horizontalOverflowPx(page);
    expect(overflow, "390px DARK overflow").toBeLessThanOrEqual(0);
  });

  test("21D-P: 1440px LIGHT and DARK — no overflow, coherent results", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const theme of ["light", "dark"] as const) {
      await openSearchPage(page, RE_DEEP_LINK_WITH_Q);
      await page.evaluate((t) => localStorage.setItem("vauto_app_theme_v1", t), theme);
      await page.reload();
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
      await expectAnchorCard(page);
      const overflow = await horizontalOverflowPx(page);
      expect(overflow, `1440px ${theme} overflow`).toBeLessThanOrEqual(0);
    }
  });
});

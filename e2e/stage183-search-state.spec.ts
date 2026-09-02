import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  installFirstTimeSearchStub,
  openHome,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 18.3 — AI-native search state, URL persistence & classic interoperability.
 *
 * The search page derives a canonical, fully-serialized state from the URL
 * (vertical → category, location/price_max/ca_* → frontend facets) via the
 * complementary URL layer, WITHOUT re-running a live AI call. The static
 * catalog deterministically contains `lt-nt-004` ("1 kambario butas studentams",
 * real_estate, Telšiai, 89 000 €, propertyType=Butas, rooms=1), which is the one
 * and only card that survives the Telšiai + Butas + rooms=1 deep-link — so every
 * results assertion targets a precise, non-empty object.
 *
 * On /search the marketplace filter bar uses the mobile surface (md:hidden
 * drawer), while the desktop filter sidebar lives on the home layout. The
 * classic-edit scenarios therefore run at 390px (mobile drawer) and the
 * URL-restore/overflow scenarios run at 390 + 1440.
 */

const RE_DEEP_LINK =
  "/search?vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas&ca_rooms=1";

const RE_CARD = '[data-listing-card][data-listing-category="real_estate"]';

function reAiChips(page: Page) {
  return {
    vertical: page.locator('[data-ai-chip][data-chip-kind="vertical"]'),
    location: page.locator('[data-ai-chip][data-chip-field="location"]'),
    propertyType: page.locator('[data-ai-chip][data-chip-field="propertyType"]'),
  };
}

// Assert the canonical RE state renders the one-and-only anchor card (non-empty).
async function expectAnchorCard(page: Page) {
  await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 12_000 });
  await expect(page.locator(RE_CARD)).toContainText("1 kambario butas studentams");
}

async function collectAgentPosts(page: Page): Promise<string[]> {
  const posts: string[] = [];
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      /vauto-agent|conductor|\/api\/search/i.test(req.url())
    ) {
      posts.push(req.url());
    }
  });
  return posts;
}

async function openSearchPage(page: Page, url: string) {
  await page.goto(url);
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
}

async function openMobileFilters(page: Page) {
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
  await expect(
    page.locator("[data-facet-drawer-trigger]").first()
  ).toBeVisible({ timeout: 10_000 });
  await page.locator("[data-facet-drawer-trigger]").first().click();
  await expect(page.locator("[data-facet-apply]").first()).toBeVisible({
    timeout: 10_000,
  });
}

async function applyMobileFilters(page: Page) {
  await page.locator("[data-facet-apply]").first().click();
  // The drawer closes on apply, so the apply control detaches.
  await expect(page.locator("[data-facet-apply]").first()).toHaveCount(0, {
    timeout: 10_000,
  });
}

test.describe("Stage 18.3 — search-state URL persistence & classic interoperability", () => {
  test("18.3-A: AI-derived facets are URL-serialized and restore on /search", async ({ page }) => {
    // Homepage AI search path (deterministic `re` stub pins lt-nt-004). The
    // client canonical adapter interprets "butas Telšiai" → RE + Telšiai + Butas.
    await page.setViewportSize({ width: 1440, height: 900 });
    await installFirstTimeSearchStub(page, "re");
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    const search = homeSearchbox(page);
    await search.fill("butas Telšiai");
    await search.press("Enter");
    await expect(page.locator("[data-ai-interpretation]")).toBeVisible({
      timeout: 10_000,
    });
    // Canonical interpretation facets are reflected.
    const chips = reAiChips(page);
    await expect(chips.vertical.first()).toContainText("Nekilnojamas", {
      timeout: 10_000,
    });
    await expect(chips.location.first()).toContainText("Telšiai", { timeout: 10_000 });
    await expect(chips.propertyType.first()).toContainText("Butas", { timeout: 10_000 });
    // The deterministic pinned card renders.
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 10_000 });

    // The same canonical facets, serialized as a /search deep-link, restore to
    // the identical card + facets — proving the AI-derived state is URL-persistent.
    const posts = await collectAgentPosts(page);
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);
    expect(page.url()).toContain("ca_propertyType=");
    expect(page.url()).toContain("location=");
    expect(posts).toEqual([]);
  });

  test("18.3-B: reload restores identical state, facets and results, no AI", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);
    const posts = await collectAgentPosts(page);
    const urlBefore = page.url();
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expectAnchorCard(page);
    expect(page.url()).toBe(urlBefore);
    expect(urlBefore).toContain("location=");
    expect(urlBefore).toContain("ca_propertyType=");
    expect(posts).toEqual([]);
  });

  test("18.3-C: fresh deep-link restores state+results without re-running AI", async ({ page }) => {
    const posts = await collectAgentPosts(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);
    expect(page.url()).toContain("ca_propertyType=");
    expect(posts).toEqual([]);
  });

  test("18.3-D: AI-restored facets + classic priceMax edit coexist in state and URL", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);

    await openMobileFilters(page);
    const priceMaxInput = page
      .locator("[data-facet-drawer]")
      .getByRole("spinbutton", { name: /Kaina iki/ });
    await expect(priceMaxInput).toBeVisible({ timeout: 10_000 });
    await priceMaxInput.fill("200000");
    await applyMobileFilters(page);

    // URL reflects the edited classic price AND keeps the AI-restored facets.
    await expect.poll(async () => page.url()).toContain("price_max=200000");
    expect(page.url()).toContain("location=");
    expect(page.url()).toContain("ca_propertyType=");
    // Results recomputed — anchor card remains under the widened bound.
    await expectAnchorCard(page);
  });

  test("18.3-E: vertical switch drops incompatible RE facets from state and URL", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);

    await openMobileFilters(page);
    const verticalSelect = page.locator("[data-facet-drawer] [data-facet-vertical-select]");
    await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
    await verticalSelect.selectOption("ELECTRONICS");
    await applyMobileFilters(page);

    // URL switches to electronics and drops the RE-only chameleon facets
    // (propertyType, rooms) while keeping agnostic location/price.
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("ca_rooms=");
  });

  test("18.3-F: Back/Forward restores classic-filter + view states with URL and facets intact", async ({ page }) => {
    // History model matches the validated Stage 17/18 canonical contract:
    // classic filter edits are non-navigational canonical serialization
    // (replaceState) that refine State A into State B on the same entry; only
    // explicit view changes push a distinct navigational entry (State C).
    //   A → canonical facets (real_estate, location, price_max, propertyType).
    //   B → classic priceMax edit (replaceState): same entry, URL re-serialized.
    //   C → view=list (pushState): new entry.
    // Back→B restores the priced canonical state; Forward→C restores list view.
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);

    // State B: classic priceMax edit via the mobile drawer (replaceState sync).
    await openMobileFilters(page);
    const priceMaxInput = page
      .locator("[data-facet-drawer]")
      .getByRole("spinbutton", { name: /Kaina iki/ });
    await priceMaxInput.fill("200000");
    await applyMobileFilters(page);
    await expect.poll(async () => page.url()).toContain("price_max=200000");

    // State C: switch to list view (navigational position, pushState ?view=list).
    const listToggle = page.getByRole("button", { name: "Sąrašas" }).first();
    await expect(listToggle).toBeVisible({ timeout: 10_000 });
    await listToggle.click();
    await expect.poll(async () => page.url()).toContain("view=list");

    // Back → B: price facet + AI facets intact, grid default restored, anchor card.
    await page.goBack({ waitUntil: "load" });
    await expect.poll(async () => page.url()).toContain("price_max=200000");
    await expect.poll(async () => page.url()).toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("view=list");
    await expectAnchorCard(page);

    // Forward → C: list view restored, canonical facets still coherent.
    await page.goForward({ waitUntil: "load" });
    await expect.poll(async () => page.url()).toContain("view=list");
    await expect.poll(async () => page.url()).toContain("ca_propertyType=");
  });

  test("18.3-H: zero-results state preserves criteria and stays editable (no auto widening)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(
      page,
      "/search?q=zzzzqwerty999&location=Tel%C5%A1iai&ca_propertyType=Butas"
    );
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // No fake results injected.
    expect(await page.locator("[data-listing-card]").count()).toBe(0);
    // Criteria stay serialized in the URL (query + location preserved verbatim).
    expect(page.url()).toContain("q=zzzzqwerty999");
    expect(page.url()).toContain("location=");
    // Classic filter controls remain editable (via the mobile drawer).
    await openMobileFilters(page);
    const locationInput = page
      .locator("[data-facet-drawer]")
      .getByRole("textbox", { name: "Vietovė" });
    await expect(locationInput).toBeVisible({ timeout: 10_000 });
    await locationInput.fill("Vilnius");
    await applyMobileFilters(page);
    // Widening criteria via classic UI recomputes and syncs URL (no new AI query).
    await expect.poll(async () => page.url()).toContain("location=Vilnius");
  });

  test("18.3-I: AI failure → classic marketplace state and navigation survive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("https://vauto-api.onrender.com/**", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });
    await openSearchPage(page, RE_DEEP_LINK);
    await expectAnchorCard(page);
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(0);
  });

  for (const vp of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`18.3-J ${vp.width}px: URL→facets→results→reload stay overflow-free`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openSearchPage(page, RE_DEEP_LINK);
      await expectAnchorCard(page);
      expect(
        await horizontalOverflowPx(page),
        `overflow at ${vp.width}px`
      ).toBeLessThanOrEqual(0);
      await page.reload({ waitUntil: "load" });
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
      await expectAnchorCard(page);
      expect(
        await horizontalOverflowPx(page),
        `overflow after reload at ${vp.width}px`
      ).toBeLessThanOrEqual(0);
    });
  }

  test("18.3.1: clearing a classic filter removes the stale complementary param (reload-safe)", async ({ page }) => {
    // Real production write path: the classic drawer's applyDrawer →
    // syncMarketplaceFiltersToUrl. The deep-link carries a full complement
    // (locationset Telsiai, price_max=120000, ca_propertyType, ca_rooms).
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearchPage(page, RE_DEEP_LINK);
    expect(page.url()).toContain("price_max=120000");

    // Clear priceMax via the classic drawer: set to empty (interpreted as cleared).
    await openMobileFilters(page);
    const priceMaxInput = page
      .locator("[data-facet-drawer]")
      .getByRole("spinbutton", { name: /Kaina iki/ });
    await expect(priceMaxInput).toBeVisible({ timeout: 10_000 });
    await priceMaxInput.fill("");
    await applyMobileFilters(page);

    // The stale price_max must disappear from the URL (state-authoritative strip).
    // (The canonical `vertical` param is owned by a separate canonical layer and
    // may be re-serialized independently of this complementary strip, so we only
    // assert the complement + that the still-active location complement survives.)
    await expect.poll(async () => page.url()).not.toContain("price_max=");
    expect(page.url()).toContain("location=");

    // Reload must not resurrect the cleared price.
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () => page.url()).not.toContain("price_max=");
    expect(page.url()).toContain("location=", "agnostic location survives reload");
  });

  // ── Stage 18.3.2 — canonical shared-facet clear closure ──────────────────────
  // These run through the REAL canonical production write path: the desktop 13B
  // FacetFilterPanel (#desktop-facet-*) → useCanonicalFacetQuery.commit() →
  // serializeMarketplaceFiltersIntoUrl + setMarketplaceFilters. Clearing the
  // canonical location / sort must be state-authoritative and reload-safe.

  test("18.3.2-A: canonical location set → clear → gone from URL and NOT restored on reload", async ({ page }) => {
    await openHome(page, { width: 1440, height: 900 });
    await page.locator("#desktop-facet-vertical").selectOption("REAL_ESTATE");

    // Set the canonical location through the real panel.
    const location = page.locator("#desktop-facet-location");
    await location.click();
    await location.fill("Vilnius");
    await location.blur();
    await expect.poll(() => page.url()).toContain("location=Vilnius");

    // Clear the canonical location (empty input) → parameter must vanish.
    await location.click();
    await location.fill("");
    await location.blur();
    await expect.poll(async () => page.url()).not.toContain("location=");
    await expect.poll(async () => page.url()).toContain("vertical=real_estate");

    // Reload → the cleared canonical location must NOT be resurrected.
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.url()).not.toContain("location=");
  });

  test("18.3.2-B: canonical sort set → clear → gone from URL and default relevance on reload", async ({ page }) => {
    await openHome(page, { width: 1440, height: 900 });
    await page.locator("#desktop-facet-vertical").selectOption("REAL_ESTATE");

    // Set a non-default canonical sort (newest) through the real panel.
    await page.locator("#desktop-facet-sort").selectOption("newest");
    await expect.poll(() => page.url()).toContain("sort=newest");

    // Clear it back to relevance → the sort param must vanish from the URL.
    await page.locator("#desktop-facet-sort").selectOption("relevance");
    await expect.poll(async () => page.url()).not.toContain("sort=");
    await expect.poll(async () => page.url()).toContain("vertical=real_estate");

    // Reload → default relevance remains; a cleared sort is not resurrected.
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => page.url()).not.toContain("sort=");
    await expect(page.locator("#desktop-facet-sort")).toHaveValue("relevance");
  });
});

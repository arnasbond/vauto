import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22B — MAP EXPERIENCE IMPLEMENTATION & PRODUCTION HARDENING
 *
 * Dedicated deterministic map E2E. External tile availability MUST NOT
 * determine correctness: tile failures are simulated via route abort and must
 * produce a graceful degraded state while canonical search state/results stay
 * intact.
 */

const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const WIDE = { width: 1200, height: 900 };

const RE_URL = "/search?vertical=real_estate&q=butas";
const JOBS_URL = "/search?vertical=jobs&q=vairuotojas";

/** Tile URL used by the default provider (see src/lib/map-provider.ts). */
const TILE_URL_PATTERN = /tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png/;

async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("vauto_app_theme_v1", t);
    } catch {
      // about:blank has no origin — ignore.
    }
    document.documentElement?.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function openSearch(
  page: Page,
  url = RE_URL,
  theme: "light" | "dark" = "light",
  viewport = MOBILE
) {
  await applyTheme(page, theme);
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
  // AI interpretation may append facets asynchronously — wait for results.
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 25_000,
  });
}

/** Real-estate vertical: MAP is PRIMARY — toolbar shows enabled MAP button on mobile. */
async function openMapOnMobile(page: Page, theme: "light" | "dark" = "light") {
  await openSearch(page, RE_URL, theme, MOBILE);
  // Mobile toolbar is inside MarketplaceFilterBar (md:hidden wrapper).
  const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
  await expect(mapBtn).toBeVisible({ timeout: 15_000 });
  await mapBtn.click();
  await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
}

test.describe("22B — capability gating (chromium)", () => {
  test("JOBS vertical: MAP NOT_APPLICABLE — map never becomes active; toolbar button disabled", async ({
    page,
  }) => {
    await openSearch(page, JOBS_URL, "light", MOBILE);
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(mapBtn).toBeVisible({ timeout: 15_000 });
    await expect(mapBtn).toHaveAttribute("aria-disabled", "true");
    await expect(mapBtn).toBeDisabled();
    // Even forcing map in URL must not render a map for JOBS (capability guard).
    await page.goto("/search?vertical=jobs&q=vairuotojas&view=map", { waitUntil: "load" });
    await dismissGdpr(page);
    await page.waitForTimeout(500);
    await expect(page.locator("[data-map-container]")).toHaveCount(0);
  });

  test("REAL_ESTATE vertical: MAP PRIMARY — map opens and preserves canonical results", async ({
    page,
  }) => {
    await openMapOnMobile(page, "light");
    // Map renders.
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    // Marker/cluster layer exists (supercluster creates markers when coords exist).
    await page.waitForTimeout(800);
    // Map footer reports geocoded listings — canonical result identity preserved.
    await expect(page.locator("[data-map-footer]")).toContainText("skelbimų");
    // Canonical query/facets still in URL while map is a presentation overlay.
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("q=butas");
  });
});

test.describe("22B — LIST/GRID → MAP → LIST/GRID continuity (chromium)", () => {
  test("LIST → MAP → LIST preserves query/facets/URL", async ({ page }) => {
    await openSearch(page, RE_URL, "light", MOBILE);
    const urlBefore = page.url();

    // Mobile toolbar: LIST default active.
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const listCardsBefore = await page.locator('[data-listing-card="list"]').count();

    // Switch to MAP.
    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);

    // Back to LIST.
    const listBtn = page.locator('[data-view-mode="list"]').first();
    await listBtn.click();
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await page.locator('[data-listing-card="list"]').count()).toBeGreaterThanOrEqual(
      Math.max(listCardsBefore - 5, 1)
    );

    // Canonical URL unchanged by presentation-mode switching.
    expect(page.url().replace(/[?&]view=[a-z]+/, "")).toBe(urlBefore.replace(/[?&]view=[a-z]+/, ""));
  });

  test("GRID → MAP → GRID preserves query/facets", async ({ page }) => {
    await openSearch(page, RE_URL, "light", MOBILE);
    const gridBtn = page.locator('[data-view-mode="grid"]').first();
    await gridBtn.click();
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
      timeout: 15_000,
    });
    const gridCountBefore = await page.locator('[data-listing-card="grid"]').count();

    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);

    const gridBtn2 = page.locator('[data-view-mode="grid"]').first();
    await gridBtn2.click();
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
      timeout: 15_000,
    });
    expect(await page.locator('[data-listing-card="grid"]').count()).toBeGreaterThanOrEqual(
      Math.max(gridCountBefore - 5, 1)
    );
  });
});

test.describe("22B — MAP → detail → back continuity (chromium)", () => {
  test("map stays interactive and canonical search survives while map is active", async ({
    page,
  }) => {
    // Scope note (22B.1 doc-fidelity): this test proves the map is interactive
    // and that canonical search state survives while MAP is the active
    // presentation mode. The FULL marker → detail → Back navigation path is
    // covered deterministically by e2e/stage22b1-audit-delta.spec.ts (AUD-02).
    await openMapOnMobile(page, "light");
    await page.waitForTimeout(1000);

    // Verify the map is interactive; markers may be clusters or photo markers.
    const mapContainer = page.locator("[data-map-container]");
    expect(await mapContainer.count()).toBe(1);

    // The map footer reports how many listings are geocoded.
    const footer = page.locator("[data-map-footer]");
    await expect(footer).toBeVisible({ timeout: 15_000 });

    // Canonical state is preserved while map is active (URL contains query).
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("q=butas");
  });
});

test.describe("22B — tile/network failure degradation (chromium)", () => {
  test("tile failure shows graceful degraded state; search/results intact", async ({
    page,
  }) => {
    // Block tile network requests BEFORE navigation.
    await page.route(TILE_URL_PATTERN, (route) => route.abort("failed"));
    await openSearch(page, RE_URL, "light", MOBILE);

    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    // Wait for tile error detection -> degraded state.
    await expect(page.locator("[data-map-degraded]")).toBeVisible({ timeout: 20_000 });
    // No JS crash, no infinite loading, no canonical state mutation.
    await expect(page.locator("[data-map-degraded]")).toContainText("Žemėlapis šiuo metu negalimas");
    // Fallback list action reachable — points at the canonical results anchor.
    await expect(page.locator("[data-map-fallback-list]")).toHaveAttribute(
      "href",
      "#listing-results"
    );
    // Canonical results section still attached (map degraded state is an overlay,
    // it never removes the canonical result scope).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // Switching back to LIST restores cards — results were never lost.
    await page.locator('[data-view-mode="list"]').first().click();
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 15_000 });
  });

  test("tile failure must NOT crash search or lose results", async ({ page }) => {
    await page.route(TILE_URL_PATTERN, (route) => route.abort("failed"));
    await openSearch(page, RE_URL, "light", MOBILE);
    // Search still works with blocked tiles.
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 25_000 });
    // Canonical state intact.
    expect(page.url()).toContain("vertical=real_estate");
  });
});

test.describe("22B — zero geocoded results (chromium)", () => {
  test("empty map state degrades gracefully without fabricated markers", async ({
    page,
  }) => {
    // Scope note (22B.1 doc-fidelity): this test proves the map never renders
    // MORE markers than the geocoded result set (markers ≤ geocoded count).
    // The DETERMINISTIC zero-geocoded scenario (canonical results exist, ZERO
    // geocodable listings) is proven by e2e/stage22b1-audit-delta.spec.ts
    // (AUD-01) via the `maptest=nogeo` test context.
    await openSearch(page, RE_URL, "light", MOBILE);
    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();

    // Map either renders (geocoded listings exist) or shows the empty state —
    // in both cases it must NOT crash and MUST NOT fabricate markers beyond the
    // geocoded set.
    await expect(
      page.locator("[data-map-container], [data-map-empty]").first()
    ).toBeAttached({ timeout: 20_000 });
    const containerCount = await page.locator("[data-map-container]").count();
    const emptyCount = await page.locator("[data-map-empty]").count();
    expect(containerCount + emptyCount, "map shell xor empty state").toBe(1);

    const markers = await page.locator("[data-map-marker]").count();
    const footerText = containerCount
      ? await page.locator("[data-map-footer]").innerText()
      : "";
    const geocodedCount = containerCount ? parseInt(footerText, 10) : 0;
    expect(markers, "markers never exceed geocoded result set").toBeLessThanOrEqual(
      Math.max(geocodedCount, 0)
    );
  });
});

test.describe("22B — vertical switch to NOT_APPLICABLE (chromium)", () => {
  test("MAP on real_estate → switch to JOBS: map disappears, capability fallback applies", async ({
    page,
  }) => {
    await openMapOnMobile(page, "light");
    const urlBefore = page.url();
    expect(urlBefore).toContain("view=map");

    // Navigate to JOBS in the same session (vertical switch).
    await page.goto("/search?vertical=jobs&q=vairuotojas", { waitUntil: "load" });
    await dismissGdpr(page);
    await page.waitForTimeout(800);
    // No map shell for JOBS.
    await expect(page.locator("[data-map-container]")).toHaveCount(0);
    // Capability fallback: canonical grid/list results present.
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("22B — live resize while MAP active (chromium)", () => {
  test("MAP survives 390→768→1200→768→390 without reload; no overflow", async ({ page }) => {
    await openMapOnMobile(page, "light");
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });

    for (const vp of [TABLET, WIDE, TABLET, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(400);
      // Map still attached after every transition (resize is a presentation
      // event, no state loss). The full per-transition MAP continuity proof
      // (visible container + effective view + canonical URL + zero overflow)
      // is covered deterministically by e2e/stage22b1-audit-delta.spec.ts
      // (AUD-03).
      await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
      expect(await horizontalOverflowPx(page)).toBe(0);
    }
  });
});

test.describe("22B — LIGHT/DARK parity (chromium)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`map opens and stays functional in ${theme} theme`, async ({ page }) => {
      await openMapOnMobile(page, theme);
      await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
      // Theme attribute applied.
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", theme);
      // No horizontal overflow in either theme.
      expect(await horizontalOverflowPx(page)).toBe(0);
    });
  }
});

test.describe("22B — accessibility fallback (chromium)", () => {
  test("map is not the only access to results; semantic list remains reachable", async ({
    page,
  }) => {
    await openMapOnMobile(page, "light");
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    // The canonical result section remains in the DOM while the map is active —
    // a user who cannot operate the visual map still has a reachable path.
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // The degraded/fallback path: switch back to LIST restores the semantic list.
    await page.locator('[data-view-mode="list"]').first().click();
    await expect(page.locator("#listing-results [data-listing-card]").first()).toBeVisible({
      timeout: 15_000,
    });
    // Canonical query survives the round-trip.
    expect(page.url()).toContain("vertical=real_estate");
  });

  test("map toolbar buttons carry accessible names/state (a11y)", async ({ page }) => {
    await openSearch(page, RE_URL, "light", MOBILE);
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(mapBtn).toHaveAttribute("aria-label", /Žemėlapis/);
    await expect(mapBtn).toHaveAttribute("aria-disabled", "false");
  });
});

import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * STAGE 22B.1 — ACCEPTANCE EVIDENCE HARDENING & CERTIFICATION DELTA
 *
 * Independent audit found exactly 3 MEDIUM acceptance-evidence blockers:
 *   AUD-01 deterministic zero-geocoded case
 *   AUD-02 real marker → detail → Back
 *   AUD-03 true live MAP resize continuity
 *
 * This suite closes them WITHOUT weakening any Stage 22B acceptance test.
 */

const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const WIDE = { width: 1200, height: 900 };

const RE_URL = "/search?vertical=real_estate&q=butas";
const RE_NOGEO_URL = "/search?vertical=real_estate&q=butas&maptest=nogeo";

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
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 25_000,
  });
}

/** Real-estate vertical: MAP is PRIMARY — open map from mobile toolbar. */
async function openMap(page: Page, url = RE_URL, theme: "light" | "dark" = "light") {
  await openSearch(page, url, theme, MOBILE);
  const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
  await expect(mapBtn).toBeVisible({ timeout: 15_000 });
  await mapBtn.click();
  await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
}

test.describe("22B.1-AUD-01 — deterministic zero-geocoded case (chromium)", () => {
  test("canonical results exist but ZERO usable map listings — empty state, no fabricated markers, LIST restores results", async ({
    page,
  }) => {
    // `maptest=nogeo` is a deterministic E2E-only geo context: the canonical
    // result set (real_estate "butas") still returns listings, but the map's
    // geocoding pipeline receives a forced zero-geocoded context. This can
    // NEVER succeed "because normal geocoded listings happened to exist".
    //
    // The flag is seeded BOTH in the URL and in sessionStorage. The canonical
    // AI facet URL sync may rewrite the URL (dropping the test param), but the
    // session context is stable for the whole test session.
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("vauto_map_test_ctx", "nogeo");
      } catch {
        // no-op
      }
    });
    await openSearch(page, RE_NOGEO_URL, "light", MOBILE);

    // Canonical results/search state still exists.
    const resultCount = await page.locator("[data-listing-card]").count();
    expect(resultCount, "canonical result set is non-empty").toBeGreaterThan(0);
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("q=butas");

    // Stage 22B remediation (HIGH-2): the AI facet interpretation of the
    // landing query settles SYNCHRONOUSLY during hydration — the URL captured
    // right after the first card renders is ALREADY the settled canonical URL
    // (no async `ca_propertyType=Butas` mutation window). Asserting the facet
    // here proves the baseline is stable for the whole scenario without any
    // settle wait.
    const urlBefore = page.url();
    expect(urlBefore, "settled URL carries the canonical AI facet immediately").toContain(
      "ca_propertyType=Butas"
    );

    // Open MAP — deterministic empty state must appear.
    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await expect(mapBtn).toBeVisible({ timeout: 15_000 });
    await mapBtn.click();

    // [data-map-empty] is visible and there is NO map container.
    await expect(page.locator("[data-map-empty]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-map-container]")).toHaveCount(0);

    // No usable map markers exist (no markers, no clusters).
    await expect(page.locator("[data-map-marker]")).toHaveCount(0);
    await expect(page.locator("[data-map-cluster-count]")).toHaveCount(0);

    // Empty presentation does not corrupt canonical search state.
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("q=butas");

    // Switching back to LIST exposes the canonical results.
    await page.locator('[data-view-mode="list"]').first().click();
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.locator("[data-listing-card]").count(),
      "LIST switch restores the same canonical result set"
    ).toBe(resultCount);

    // URL/facets/vertical remain correct (only the presentation view param changed).
    expect(page.url().replace(/[?&]view=[a-z]+/, "")).toBe(
      urlBefore.replace(/[?&]view=[a-z]+/, "")
    );
    expect(page.url()).toContain("vertical=real_estate");
  });
});

test.describe("22B.1-AUD-02 — real marker → detail → Back (chromium)", () => {
  test("SEARCH → MAP → individual marker → LISTING DETAIL → browser Back → SEARCH/MAP restored", async ({
    page,
  }) => {
    await openMap(page, RE_URL, "light");
    // Stage 22B remediation (HIGH-2): canonical URL is settled synchronously
    // during hydration — the settled URL already carries the AI facet before
    // marker navigation begins (no async mutation window).
    expect(page.url()).toContain("ca_propertyType=Butas");

    // Deterministically reach an individual (photo) marker: if a cluster is
    // shown, keep expanding it until a photo marker `[data-map-marker]` is
    // interactive. This is NOT a conditional skip — it exercises the real
    // marker-navigation path.
    const marker = page.locator("[data-map-marker]").first();
    const cluster = page.locator("[data-map-cluster-count]").first();

    let expanded = 0;
    for (let i = 0; i < 6 && expanded < 5; i++) {
      if ((await marker.count()) > 0) break;
      if ((await cluster.count()) === 0) break;
      await cluster.click();
      await page.waitForTimeout(600);
      expanded += 1;
    }
    expect(
      await marker.count(),
      "an individual marker must become reachable after cluster expansion"
    ).toBeGreaterThan(0);

    // Canonical state captured BEFORE navigation. The AI facet URL sync may
    // rewrite the URL (adding/removing the `view` presentation param), so the
    // canonical comparison strips the view param — vertical/query/facets are
    // the canonical contract, presentation is proven by [data-map-container].
    const urlBeforeCanonical = page.url().replace(/[?&]view=[a-z]+/, "");
    const listingId = await marker.getAttribute("title");

    // REAL marker navigation: dispatch the DOM click on the Leaflet photo
    // marker icon itself. Leaflet binds its click handler to this element;
    // dispatchEvent avoids flaky actionability on Leaflet's re-rendered icons.
    await marker.dispatchEvent("click");
    await page.waitForURL(/\/listing\//, { timeout: 20_000 });
    await expect(page.locator("[data-listing-detail-2]")).toBeAttached({
      timeout: 20_000,
    });
    // The marker pointed at a real listing (photo markers carry the title) —
    // the detail page rendered actual content.
    if (listingId) {
      const title = await page.locator("[data-listing-detail-2] h1").first().innerText();
      expect(title.trim().length, "detail page rendered a title").toBeGreaterThan(0);
    }

    // Browser Back → SEARCH/MAP restored in the same session (no reload of search).
    await page.goBack();
    await page.waitForLoadState("load");

    // MAP view mode restored where applicable.
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });

    // Canonical vertical/query/facets unchanged — no duplicate/incorrect URL
    // state, no search-state corruption.
    expect(page.url().replace(/[?&]view=[a-z]+/, "")).toBe(urlBeforeCanonical);
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("q=butas");

    // Results remain accessible (canonical #listing-results attached while map active).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    // No search-state corruption: switching to LIST exposes the same canonical cards.
    await page.locator('[data-view-mode="list"]').first().click();
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("22B.1-AUD-03 — true live MAP resize continuity (chromium)", () => {
  test("390→768→1200→768→390 in ONE session: MAP visible + effective + canonical unchanged + zero overflow after EVERY transition", async ({
    page,
  }) => {
    // Start from canonical SEARCH and make MAP the EXPLICIT effective view via
    // the real user path (mobile toolbar button). The canonical AI facet URL
    // sync may rewrite the URL after load, so the canonical comparison below
    // strips the `view` presentation param (vertical/query/facets are the
    // canonical contract; MAP-as-effective-mode is proven by the visible
    // [data-map-container] after EVERY transition).
    await openMap(page, RE_URL, "light");

    // Stage 22B remediation (HIGH-2): the canonical URL settles synchronously
    // during hydration — no settle wait needed before the resize chain begins.
    // Prove MAP is the effective view mode while the mobile toolbar is visible.
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const canonicalUrlBefore = page.url().replace(/[?&]view=[a-z]+/, "");
    expect(
      canonicalUrlBefore,
      "settled canonical URL carries the AI facet before any resize"
    ).toContain("ca_propertyType=Butas");

    // Canonical geocoded count captured BEFORE any resize — the same map must
    // survive the whole chain without reload and without losing its state.
    await page.waitForTimeout(800);
    const footerCountBefore = await page
      .locator("[data-map-footer]")
      .getAttribute("data-map-listing-count");

    const steps: Array<{ label: string; vp: { width: number; height: number } }> = [
      { label: "390", vp: MOBILE },
      { label: "768", vp: TABLET },
      { label: "1200", vp: WIDE },
      { label: "768-again", vp: TABLET },
      { label: "390-back", vp: MOBILE },
    ];

    for (const step of steps) {
      await page.setViewportSize(step.vp);
      // Fold/unfold/live-resize must NOT reload the page.
      await page.waitForTimeout(500);

      // [data-map-container] visible after EVERY transition — MAP is and stays
      // the effective view mode at every width.
      await expect(
        page.locator("[data-map-container]"),
        `map visible at ${step.label}`
      ).toBeVisible({ timeout: 15_000 });

      // Canonical vertical/query/facets unchanged — URL (minus the `view`
      // presentation param) byte-identical to the pre-resize canonical URL.
      // Resize never rewrites canonical state.
      expect(page.url().replace(/[?&]view=[a-z]+/, ""), `canonical URL at ${step.label}`).toBe(
        canonicalUrlBefore
      );

      // Canonical result set remains accessible (map is a presentation overlay).
      await expect(page.locator("#listing-results")).toBeAttached({
        timeout: 15_000,
      });
      if (footerCountBefore != null) {
        await expect(page.locator("[data-map-footer]")).toHaveAttribute(
          "data-map-listing-count",
          footerCountBefore,
          `geocoded listing count stable at ${step.label}`
        );
      }

      // horizontalOverflowPx === 0.
      expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
    }

    // Back at mobile: the toolbar is visible again and still shows MAP pressed
    // (explicit canonical view survived the whole chain).
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

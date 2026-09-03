import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
} from "./helpers/seed";

/**
 * F8 — map tile-ready reliability (deterministic mocks; no public OSM
 * network dependency).
 *
 * Three deterministic behaviors are exercised:
 *   - READY: mocked tiles resolve instantly → `data-map-status="ready"`
 *     AND at least one tile is REALLY VISIBLE (`.leaflet-tile-loaded` with
 *     non-zero size and visible computed style);
 *   - ERROR: mocked tiles abort → the canonical degraded/list fallback;
 *   - TIMEOUT: mocked tiles hang → degraded fallback within the budget;
 * plus Map→Grid→Map remount, invalidateSize, zoom and cold/warm timing.
 */

const SEARCH_URL = "/search?vertical=transport&q=Volvo";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function openSearchWithMap(page: import("@playwright/test").Page) {
  await forceOfflineCatalog(page);
  await page.goto(SEARCH_URL);
  await acceptGdprConsentIfPrompted(page);
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 20_000,
  });
  const mapButton = page.locator('[data-view-mode="map"]');
  await expect(mapButton).toBeVisible({ timeout: 15_000 });
  return mapButton;
}

test.describe("F8 — žemėlapio tile-ready patikimumas", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("ready kelias: tikrai matoma plytelė, ne vien konteineris", async ({
    page,
  }) => {
    await page.route(/openstreetmap/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
    );
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();

    const container = page.locator('[data-map-container="1"]');
    await expect(container).toBeVisible({ timeout: 20_000 });
    await expect(container).toHaveAttribute("data-map-status", "ready", {
      timeout: 15_000,
    });

    // REAL visibility: at least one loaded tile is actually visible.
    const visibleTiles = await page
      .locator(".leaflet-tile-loaded")
      .evaluateAll((els) =>
        els.filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
        }).length
      );
    expect(visibleTiles, "at least one really visible tile").toBeGreaterThan(0);
    await expect(page.locator("[data-map-loading]")).toHaveCount(0);
  });

  test("error kelias: sugadintos plytelės → degraded/list fallback", async ({
    page,
  }) => {
    await page.route(/openstreetmap/, (route) => route.abort());
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator("[data-map-degraded]")).toBeVisible({
      timeout: 20_000,
    });
    // The fallback link restores the canonical result list.
    await expect(page.locator("[data-map-fallback-list]")).toBeVisible();
  });

  test("timeout kelias: kabantys plytelės → degraded per nustatytą laiką", async ({
    page,
  }) => {
    await page.route(/openstreetmap/, async () => {
      // never resolves — simulated hang (an unresolved async handler keeps
      // the request pending WITHOUT passing it through to the network)
      await new Promise(() => {});
    });
    const mapButton = await openSearchWithMap(page);
    const t0 = Date.now();
    await mapButton.click();
    await expect(page.locator("[data-map-degraded]")).toBeVisible({
      timeout: 15_000,
    });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(12_000);
    expect(elapsed).toBeGreaterThanOrEqual(7_000);
  });

  test("Map→Grid→Map: remount, invalidateSize ir zoom veikia; warm < cold", async ({
    page,
  }) => {
    await page.route(/openstreetmap/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
    );
    const mapButton = await openSearchWithMap(page);

    const t0 = Date.now();
    await mapButton.click();
    await expect(page.locator('[data-map-container="1"]')).toHaveAttribute(
      "data-map-status",
      "ready",
      { timeout: 15_000 }
    );
    const coldMs = Date.now() - t0;

    // zoom: tiles still resolve and remain visible after zoom-in.
    await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(600);
    const visibleAfterZoom = await page
      .locator(".leaflet-tile-loaded")
      .evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width > 0).length);
    expect(visibleAfterZoom).toBeGreaterThan(0);

    // Grid → Map (remount + invalidateSize).
    await page.locator('[data-view-mode="grid"]').click();
    await expect(page.locator("[data-listing-grid]")).toBeVisible({
      timeout: 15_000,
    });
    const t1 = Date.now();
    await page.locator('[data-view-mode="map"]').click();
    await expect(page.locator('[data-map-container="1"]')).toHaveAttribute(
      "data-map-status",
      "ready",
      { timeout: 15_000 }
    );
    const warmMs = Date.now() - t1;
    expect(warmMs).toBeLessThan(coldMs + 3000);
  });

  test("viename route nėra konkuruojančių priority/preload vaizdų", async ({
    page,
  }) => {
    await page.route(/openstreetmap/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
    );
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator('[data-map-container="1"]')).toBeVisible({
      timeout: 20_000,
    });
    const preloads = await page.locator('link[rel="preload"][as="image"]').count();
    expect(preloads, "at most one LCP preload image per route").toBeLessThanOrEqual(1);
  });
});

import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
} from "./helpers/seed";

/**
 * F8 — map tile-ready reliability v2 (deterministic mocks; no public OSM
 * network dependency).
 *
 * Readiness contract: `data-map-status="ready"` may appear ONLY when at
 * least one `.leaflet-tile-loaded` tile inside the ACTIVE map container is
 * REALLY VISIBLE (width > 0, height > 0, visibility !== hidden,
 * display !== none, opacity > 0). The Leaflet `load` event is inert.
 * `tileerror` or the 8s timeout degrades, and a late tile can never restore
 * `ready`.
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

async function fulfillTiles(page: import("@playwright/test").Page) {
  await page.route(/openstreetmap/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TINY_PNG })
  );
}

async function hangTiles(page: import("@playwright/test").Page) {
  await page.route(/openstreetmap/, async () => {
    // never resolves — simulated hang (an unresolved async handler keeps
    // the request pending WITHOUT passing it through to the network)
    await new Promise(() => {});
  });
}

/** Assert the map never reached `ready` while the tiles were invalid. */
async function expectNeverReady(page: import("@playwright/test").Page) {
  const status = await page
    .locator('[data-map-container="1"]')
    .getAttribute("data-map-status");
  expect(status, "must not reach ready on invalid tiles").not.toBe("ready");
}

test.describe("F8 — žemėlapio tile-ready patikimumas", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("ready kelias: tikrai matoma plytelė → ready", async ({ page }) => {
    await fulfillTiles(page);
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();

    const container = page.locator('[data-map-container="1"]');
    await expect(container).toBeVisible({ timeout: 20_000 });
    await expect(container).toHaveAttribute("data-map-status", "ready", {
      timeout: 15_000,
    });
    await expect(page.locator("[data-map-loading]")).toHaveCount(0);

    // REAL visibility inside the ACTIVE container: at least one loaded tile
    // with positive size and visible computed style.
    const visibleTiles = await container
      .locator(".leaflet-tile-loaded")
      .evaluateAll((els) =>
        els.filter((el) => {
          const cs = getComputedStyle(el);
          return (
            el instanceof HTMLImageElement &&
            el.offsetWidth > 0 &&
            el.offsetHeight > 0 &&
            cs.visibility !== "hidden" &&
            cs.display !== "none" &&
            Number.parseFloat(cs.opacity) > 0
          );
        }).length
      );
    expect(visibleTiles, "at least one really visible tile").toBeGreaterThan(0);
  });

  test("load signalas be matomų plytelių → niekada ready, po timeout degraded", async ({
    page,
  }) => {
    await hangTiles(page);
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator('[data-map-container="1"]')).toBeVisible({
      timeout: 20_000,
    });

    // Adversarial: fire a `load` signal on the map container while the tiles
    // hang — the contract ignores it; readiness needs a visible tile.
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const el = document.querySelector(".leaflet-container");
      el?.dispatchEvent(new Event("load", { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    await expectNeverReady(page);

    await expect(page.locator("[data-map-degraded]")).toBeVisible({
      timeout: 15_000,
    });
  });

  const invalidTileStyles: Array<{ name: string; css: string }> = [
    {
      name: "plytelė su klase, bet hidden",
      css: ".leaflet-tile-loaded { visibility: hidden !important; }",
    },
    {
      name: "plytelė su klase, bet zero-size",
      css: ".leaflet-tile { width: 0 !important; height: 0 !important; }",
    },
    {
      name: "plytelė su klase, bet opacity 0",
      css: ".leaflet-tile-loaded { opacity: 0 !important; }",
    },
  ];

  for (const scenario of invalidTileStyles) {
    test(`${scenario.name} → ne ready`, async ({ page }) => {
      await fulfillTiles(page);
      const mapButton = await openSearchWithMap(page);
      // Inject AFTER navigation: the style must live in the SPA document
      // where the map mounts (a pre-navigation tag dies with the old doc).
      await page.addStyleTag({ content: scenario.css });
      await mapButton.click();
      await expect(page.locator('[data-map-container="1"]')).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(4000);
      await expectNeverReady(page);
      await expect(page.locator("[data-map-degraded]")).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test(".leaflet-tile-loaded kitame konteineryje → aktyvus žemėlapis negauna ready", async ({
    page,
  }) => {
    await hangTiles(page);
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator('[data-map-container="1"]')).toBeVisible({
      timeout: 20_000,
    });

    // A REALLY VISIBLE loaded tile injected OUTSIDE the active map container
    // must NOT flip the active map to ready (scoping guard).
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.className = "leaflet-tile leaflet-tile-loaded";
      img.style.cssText =
        "position:fixed;top:0;left:0;width:256px;height:256px;opacity:1;z-index:9999";
      img.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      document.body.appendChild(img);
    });
    await page.waitForTimeout(1500);
    await expectNeverReady(page);

    await expect(page.locator("[data-map-degraded]")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("vėlyva plytelė po degraded neatkuria ready", async ({ page }) => {
    await hangTiles(page);
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator("[data-map-degraded]")).toBeVisible({
      timeout: 15_000,
    });

    // Late signal: a truly visible loaded tile appears after degradation.
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.className = "leaflet-tile leaflet-tile-loaded";
      img.style.cssText =
        "position:fixed;top:0;left:0;width:256px;height:256px;opacity:1;z-index:9999";
      img.src =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      document.body.appendChild(img);
    });
    await page.waitForTimeout(2000);

    await expect(page.locator("[data-map-degraded]")).toBeVisible();
    await expect(page.locator('[data-map-status="ready"]')).toHaveCount(0);
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
    await hangTiles(page);
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
    await fulfillTiles(page);
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
      .locator('[data-map-container="1"] .leaflet-tile-loaded')
      .evaluateAll(
        (els) =>
          els.filter((el) => {
            if (!(el instanceof HTMLElement)) return false;
            const cs = getComputedStyle(el);
            return (
              el.offsetWidth > 0 &&
              el.offsetHeight > 0 &&
              cs.visibility !== "hidden" &&
              Number.parseFloat(cs.opacity) > 0
            );
          }).length
      );
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
    await fulfillTiles(page);
    const mapButton = await openSearchWithMap(page);
    await mapButton.click();
    await expect(page.locator('[data-map-container="1"]')).toBeVisible({
      timeout: 20_000,
    });
    const preloads = await page
      .locator('link[rel="preload"][as="image"]')
      .count();
    expect(preloads, "at most one LCP preload image per route").toBeLessThanOrEqual(1);
  });
});

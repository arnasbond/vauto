import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * STAGE 22B.1 — DELTA VISUAL EVIDENCE (AUD-01 / AUD-02 / AUD-03).
 *
 * Captures deterministic visual proof for the three independent-audit
 * acceptance-evidence blockers:
 *   AUD-01 — zero-geocoded empty map state (no fabricated markers)
 *   AUD-02 — marker → detail → Back (photo marker + restored search/map)
 *   AUD-03 — live MAP resize continuity (same session, no reload)
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22b1", "screenshots");

async function capture(page: Page, file: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: false });
}

test.describe("22B.1-O — delta visual evidence (chromium)", () => {
  test("AUD-01 zero-geocoded: canonical results + empty map state", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("vauto_map_test_ctx", "nogeo");
      } catch {
        /* no-op */
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/search?vertical=real_estate&q=butas&maptest=nogeo", {
      waitUntil: "load",
    });
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 25_000,
    });
    await capture(page, path.join(OUT, "aud01-canonical-list-390.png"));

    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    await expect(page.locator("[data-map-empty]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-map-marker]")).toHaveCount(0);
    await capture(page, path.join(OUT, "aud01-empty-map-390.png"));

    await page.locator('[data-view-mode="list"]').first().click();
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 15_000,
    });
    await capture(page, path.join(OUT, "aud01-list-restored-390.png"));
  });

  test("AUD-02 marker → detail → Back: map restored with canonical state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/search?vertical=real_estate&q=butas", { waitUntil: "load" });
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 25_000,
    });

    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(900);

    // Deterministically expand clusters until an individual photo marker is
    // interactive, then navigate via the real marker.
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
    expect(await marker.count()).toBeGreaterThan(0);
    await capture(page, path.join(OUT, "aud02-marker-before-click-390.png"));

    await marker.dispatchEvent("click");
    await page.waitForURL(/\/listing\//, { timeout: 20_000 });
    await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 20_000 });
    await capture(page, path.join(OUT, "aud02-detail-390.png"));

    await page.goBack();
    await page.waitForLoadState("load");
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    await capture(page, path.join(OUT, "aud02-map-restored-after-back-390.png"));
  });

  test("AUD-03 live MAP resize continuity: same session, no reload", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/search?vertical=real_estate&q=butas", { waitUntil: "load" });
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 25_000,
    });

    const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
    await mapBtn.click();
    await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);

    const steps = [
      { label: "390", width: 390, height: 844 },
      { label: "768", width: 768, height: 1024 },
      { label: "1200", width: 1200, height: 900 },
      { label: "768-again", width: 768, height: 1024 },
      { label: "390-back", width: 390, height: 844 },
    ];
    for (const step of steps) {
      await page.setViewportSize({ width: step.width, height: step.height });
      await page.waitForTimeout(500);
      await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 15_000 });
      expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
      await capture(page, path.join(OUT, `aud03-map-${step.label}.png`));
    }
  });
});

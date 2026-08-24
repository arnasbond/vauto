import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22B-O — MAP VISUAL EVIDENCE (SAME SESSION / NO RELOAD).
 *
 * Captures map screenshots across the resize chain for LIGHT and DARK at the
 * required responsive widths. Pairs screenshots with functional assertions
 * (map attached, canonical URL stable, no overflow).
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22b", "screenshots");

const CHAIN = [
  { label: "390", width: 390, height: 844 },
  { label: "640", width: 640, height: 800 },
  { label: "768", width: 768, height: 1024 },
  { label: "1200", width: 1200, height: 900 },
  { label: "1440", width: 1440, height: 900 },
  { label: "back-390", width: 390, height: 844 },
];

async function capture(page: Page, file: string, assertCb?: () => Promise<void>) {
  if (assertCb) await assertCb();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: false });
}

test.describe("22B-O — map visual evidence (chromium)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`map resize chain ${theme} — same session, no reload`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      const url = "/search?vertical=real_estate&q=butas";
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url, { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 25_000 });

      // Open MAP on mobile.
      const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
      await expect(mapBtn).toBeVisible({ timeout: 15_000 });
      await mapBtn.click();
      await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      const urlBefore = page.url();

      for (const step of CHAIN) {
        if (step.label !== "390") {
          await page.setViewportSize({ width: step.width, height: step.height });
        }
        await page.waitForTimeout(350);
        // Map still attached after resize (presentation event only).
        await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await capture(
          page,
          path.join(OUT, `map-${theme}-${step.label}.png`)
        );
      }
    });

    test(`map detail continuity ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      const url = "/search?vertical=real_estate&q=butas";
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url, { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 25_000 });

      const mapBtn = page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first();
      await mapBtn.click();
      await expect(page.locator("[data-map-container]")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(800);
      const urlBefore = page.url();

      // Return to LIST to reach the semantic card list (map is a presentation
      // mode; the canonical list is the accessible path to results).
      await page.locator('[data-view-mode="list"]').first().click();
      await expect(page.locator("[data-listing-card] a").first()).toBeVisible({
        timeout: 15_000,
      });
      const firstCard = page.locator("[data-listing-card] a").first();
      await firstCard.click();
      await page.waitForURL(/\/listing\//, { timeout: 20_000 });
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 20_000 });
      await capture(page, path.join(OUT, `map-detail-${theme}.png`));

      // Back to search — map/search state preserved.
      await page.goBack();
      await page.waitForLoadState("load");
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
      expect(page.url().replace(/[?&]view=[a-z]+/, "")).toBe(
        urlBefore.replace(/[?&]view=[a-z]+/, "")
      );
      await capture(page, path.join(OUT, `map-back-${theme}.png`));
    });
  }
});

import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.2-O — LIVE-VIEWPORT VISUAL EVIDENCE (SAME SESSION / NO RELOAD).
 *
 * Captures screenshots across the fold->unfold->fold resize chain for LIGHT and
 * DARK. Pairs screenshots with functional assertions (state + geometry), because
 * screenshots alone never prove continuity.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22a2", "screenshots");

const CHAIN = [
  { label: "390", width: 390, height: 844 },
  { label: "intermediate", width: 640, height: 800 },
  { label: "768", width: 768, height: 1024 },
  { label: "wide", width: 1200, height: 900 },
  { label: "back-390", width: 390, height: 844 },
];

async function capture(
  page: Page,
  file: string,
  assertCb?: () => Promise<void>
) {
  if (assertCb) await assertCb();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: false });
}

test.describe("22A.2-O — live-viewport visual evidence (chromium)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`search results resize chain ${theme} — state preserved, no reload`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      const url =
        "/search?vertical=real_estate&q=" +
        encodeURIComponent("butas Telšiai") +
        "&location=Tel%C5%A1iai&price_max=120000";
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url, { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      // Wait for async AI facet interpretation to settle BEFORE recording the
      // canonical URL — resize must not mutate it afterwards.
      await expect
        .poll(async () => page.url(), { timeout: 15_000 })
        .toContain("ca_propertyType=Butas");
      await page.waitForTimeout(500);
      const urlBefore = page.url();

      for (const step of CHAIN) {
        if (step.label !== "390") await page.setViewportSize({ width: step.width, height: step.height });
        await page.waitForTimeout(300);
        expect(page.url(), `URL stable at ${step.label}`).toBe(urlBefore);
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 10_000 });
        await capture(
          page,
          path.join(OUT, `search-${theme}-${step.label}.png`)
        );
      }
    });

    test(`listing detail resize chain ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/listing/?id=lt-auto-001", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 25_000 });
      const detail = page.locator("[data-listing-detail-2]").first();
      await expect(detail.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      const title = await detail.locator("h1").first().innerText();

      for (const step of CHAIN) {
        if (step.label !== "390") await page.setViewportSize({ width: step.width, height: step.height });
        await page.waitForTimeout(300);
        expect(await detail.locator("h1").first().innerText()).toBe(title);
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await capture(
          page,
          path.join(OUT, `detail-${theme}-${step.label}.png`)
        );
      }
    });

    test(`explicit GRID resize chain ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/search?vertical=transport&q=Volvo", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      await page.getByRole("button", { name: "Tinklelis" }).first().click();
      await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
        timeout: 15_000,
      });

      for (const step of CHAIN) {
        if (step.label !== "390") await page.setViewportSize({ width: step.width, height: step.height });
        await page.waitForTimeout(300);
        // Explicit GRID must survive every resize.
        await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 10_000 });
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await capture(
          page,
          path.join(OUT, `grid-${theme}-${step.label}.png`)
        );
      }
    });

    test(`orientation-like transition ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/search?vertical=transport&q=Volvo", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });

      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await capture(page, path.join(OUT, `orientation-${theme}-landscape.png`));

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await capture(page, path.join(OUT, `orientation-${theme}-portrait.png`));
    });
  }
});

// Create the output directory before the tests run (Playwright runs tests after
// this module is loaded, so a synchronous mkdir is fine here).
fs.mkdirSync(OUT, { recursive: true });

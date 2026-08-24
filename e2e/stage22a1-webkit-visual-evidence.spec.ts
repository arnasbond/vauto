import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { dismissGdpr } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.1-E — WebKit/iPhone 390px visual evidence (AFTER).
 *
 * Dedicated file-level WebKit project (e2e-webkit) so the browser engine is
 * pinned at file scope (Playwright rejects browserName in describe blocks).
 * Captures vehicles LIGHT/DARK at 390x844 on the iPhone-class WebKit profile
 * and proves the automatic narrow-mobile default is the readable LIST with
 * zero horizontal overflow.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22a1", "visual");

test.use({ browserName: "webkit" });

async function capture(
  page: Page,
  theme: "light" | "dark",
  url: string,
  label: string
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_app_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
    timeout: 15_000,
  });
  expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
  await page.waitForTimeout(500);
  const file = path.join(OUT, `${label}-390-webkit.png`);
  await page.screenshot({ path: file, fullPage: false });
  const overflow = await page.evaluate(() => {
    return {
      body: document.body.scrollWidth - document.body.clientWidth,
      root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(Math.max(overflow.body, overflow.root), `overflow ${label}`).toBe(0);
}

test.describe("22A.1-E — WebKit/iPhone 390px AFTER visual evidence", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`vehicles ${theme} 390 webkit`, async ({ page }) => {
      await capture(
        page,
        theme,
        "/search?vertical=transport&q=Volvo",
        `vehicles-${theme}`
      );
    });
  }
});

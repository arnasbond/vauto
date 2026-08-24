import { test, expect, type Page } from "@playwright/test";
import { devices } from "@playwright/test";
import path from "node:path";
import * as fs from "node:fs";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.2-O — WebKit/iPhone LIVE-VIEWPORT VISUAL EVIDENCE.
 *
 * Same session / NO RELOAD resize chains on the WebKit engine with an
 * iPhone-class profile, for LIGHT and DARK:
 *   - search results 390 → 640 → 768 → 1200 → 390
 *   - listing detail 390 → 640 → 1200 → 390
 *   - explicit GRID 390 → 768 → 1200 → 390
 *   - orientation-like 390x844 → 844x390 → 390x844
 *
 * Screenshots are paired with functional assertions (URL stability, no
 * horizontal overflow, presentation adaptation) — screenshots alone never
 * prove state continuity.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22a2", "screenshots");

test.use({
  browserName: "webkit",
  channel: undefined,
  ...devices["iPhone 13"],
});

const CHAIN = [
  { label: "390", width: 390, height: 844 },
  { label: "intermediate", width: 640, height: 800 },
  { label: "768", width: 768, height: 1024 },
  { label: "wide", width: 1200, height: 900 },
  { label: "back-390", width: 390, height: 844 },
];

async function open(
  page: Page,
  url: string,
  theme: "light" | "dark"
) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("vauto_app_theme_v1", t);
    } catch {
      // about:blank has no origin — ignore.
    }
    document.documentElement?.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
}

async function capture(page: Page, file: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: false });
}

test.describe("22A.2-O — live-viewport visual evidence (webkit/iPhone)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WebKit ${theme}: search results resize chain, state preserved, no reload`, async ({
      page,
    }) => {
      await open(
        page,
        "/search?vertical=real_estate&q=" +
          encodeURIComponent("butas Telšiai") +
          "&location=Tel%C5%A1iai&price_max=120000",
        theme
      );
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      await expect
        .poll(async () => page.url(), { timeout: 15_000 })
        .toContain("ca_propertyType=Butas");
      await page.waitForTimeout(500);
      const urlBefore = page.url();

      for (const step of CHAIN) {
        if (step.label !== "390") {
          await page.setViewportSize({ width: step.width, height: step.height });
        }
        await page.waitForTimeout(300);
        expect(page.url(), `URL stable at ${step.label}`).toBe(urlBefore);
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await expect(page.locator("[data-listing-card]").first()).toBeVisible({
          timeout: 10_000,
        });
        await capture(page, path.join(OUT, `search-${theme}-${step.label}-webkit.png`));
      }
    });

    test(`WebKit ${theme}: listing detail resize chain`, async ({ page }) => {
      await open(page, "/listing/?id=lt-auto-001", theme);
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 25_000 });
      const detail = page.locator("[data-listing-detail-2]").first();
      await expect(detail.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      const title = await detail.locator("h1").first().innerText();

      for (const step of CHAIN) {
        if (step.label !== "390") {
          await page.setViewportSize({ width: step.width, height: step.height });
        }
        await page.waitForTimeout(300);
        expect(await detail.locator("h1").first().innerText()).toBe(title);
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await capture(page, path.join(OUT, `detail-${theme}-${step.label}-webkit.png`));
      }
    });

    test(`WebKit ${theme}: explicit GRID resize chain`, async ({ page }) => {
      await open(page, "/search?vertical=transport&q=Volvo", theme);
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      await page.getByRole("button", { name: "Tinklelis" }).first().click();
      await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
        timeout: 15_000,
      });

      for (const step of CHAIN) {
        if (step.label !== "390") {
          await page.setViewportSize({ width: step.width, height: step.height });
        }
        await page.waitForTimeout(300);
        // Explicit GRID must survive every resize.
        await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
          timeout: 10_000,
        });
        expect(await horizontalOverflowPx(page), `no overflow at ${step.label}`).toBe(0);
        await capture(page, path.join(OUT, `grid-${theme}-${step.label}-webkit.png`));
      }
    });

    test(`WebKit ${theme}: orientation-like transition`, async ({ page }) => {
      await open(page, "/search?vertical=transport&q=Volvo", theme);
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });

      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await capture(page, path.join(OUT, `orientation-${theme}-landscape-webkit.png`));

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await capture(page, path.join(OUT, `orientation-${theme}-portrait-webkit.png`));
    });
  }
});

fs.mkdirSync(OUT, { recursive: true });

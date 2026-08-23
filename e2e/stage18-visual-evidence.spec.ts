import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import {
  dismissGdpr,
  homeSearchbox,
  installFirstTimeSearchStub,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 18P — Visual evidence.
 *
 * Produces deterministic LIGHT + DARK screenshots of the AI-native marketplace
 * across the responsive matrix (390 / 1440 / 1920). Uses the same deterministic
 * query stub as the Stage 18 E2E suite so the rendered output is reproducible.
 * Screenshots are saved under docs/ui-stage18/.
 */

const OUT = path.join("docs", "ui-stage18");

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    const el = document.documentElement;
    el.setAttribute("data-app-theme", t);
    el.classList.toggle("dark", t === "dark");
    el.classList.toggle("light", t === "light");
  }, theme);
  // Give the browser a frame to repaint with the new theme variables.
  await page.waitForTimeout(300);
}

async function forceThemeOnLoad(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    const apply = () => {
      const el = document.documentElement;
      el.setAttribute("data-app-theme", t);
      el.classList.toggle("dark", t === "dark");
      el.classList.toggle("light", t === "light");
    };
    apply();
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true,
    });
  }, theme);
}

test.describe("Stage 18P — Visual evidence", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`homepage ${theme} at 390 / 1440 / 1920`, async ({ page }) => {
      for (const vp of [
        { w: 390, h: 844 },
        { w: 1440, h: 900 },
        { w: 1920, h: 1080 },
      ]) {
        await forceThemeOnLoad(page, theme);
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto("/");
        await dismissGdpr(page);
        await expect(page.locator("[data-home-h1]")).toBeVisible({
          timeout: 20_000,
        });
        await setTheme(page, theme);
        await page.screenshot({
          path: path.join(OUT, `home-${theme}-${vp.w}.png`),
          fullPage: false,
        });
      }
    });

    test(`search/results ${theme} at 390 / 1440`, async ({ page }) => {
      for (const vp of [
        { w: 390, h: 844 },
        { w: 1440, h: 900 },
      ]) {
        await forceThemeOnLoad(page, theme);
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await installFirstTimeSearchStub(page, "hits");
        await page.goto("/");
        await dismissGdpr(page);
        const search = homeSearchbox(page);
        await expect(search).toBeVisible();
        await search.fill("Ieškau 2 kambarių buto Vilniuje iki 120 000 €");
        await search.press("Enter");
        await expect(page.locator("#listing-results")).toBeAttached({
          timeout: 15_000,
        });
        await setTheme(page, theme);
        await page.screenshot({
          path: path.join(OUT, `search-${theme}-${vp.w}.png`),
          fullPage: false,
        });
      }
    });

    test(`listing detail ${theme} at 390 / 1440`, async ({ page }) => {
      for (const vp of [
        { w: 390, h: 844 },
        { w: 1440, h: 900 },
      ]) {
        await forceThemeOnLoad(page, theme);
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto("/listing?slug=lt-el-004");
        await dismissGdpr(page);
        await expect(
          page.getByRole("heading", { name: /MacBook/i }).first()
        ).toBeAttached({ timeout: 20_000 });
        await setTheme(page, theme);
        await page.screenshot({
          path: path.join(OUT, `listing-${theme}-${vp.w}.png`),
          fullPage: false,
        });
      }
    });

    test(`real-estate search ${theme} at 390 / 1440 (list + map)`, async ({ page }) => {
      for (const vp of [
        { w: 390, h: 844 },
        { w: 1440, h: 900 },
      ]) {
        await forceThemeOnLoad(page, theme);
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await installFirstTimeSearchStub(page, "hits");
        await page.goto("/");
        await dismissGdpr(page);
        const search = homeSearchbox(page);
        await expect(search).toBeVisible();
        await search.fill("butas Vilnius");
        await search.press("Enter");
        await expect(page.locator("#listing-results")).toBeAttached({
          timeout: 15_000,
        });
        await setTheme(page, theme);
        await page.screenshot({
          path: path.join(OUT, `re-search-${theme}-${vp.w}-list.png`),
          fullPage: false,
        });
        // 18D — desktop also captures the map view (markers + split panel).
        if (vp.w >= 1440) {
          const mapToggle = page.getByRole("button", { name: /Žemėlapis/i }).first();
          if (await mapToggle.isVisible().catch(() => false)) {
            await mapToggle.click();
            await page.waitForTimeout(500);
            await page.screenshot({
              path: path.join(OUT, `re-search-${theme}-${vp.w}-map.png`),
              fullPage: false,
            });
          }
        }
      }
    });
  }
});

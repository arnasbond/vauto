import { test, expect, type Page } from "@playwright/test";
import { devices } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.2 — WebKit/iPhone live-viewport continuity (C/H/L).
 *
 * browserName must be set at FILE level (Playwright restriction), hence this
 * dedicated spec. Uses WebKit engine with an iPhone-class profile to prove the
 * foldable/dynamic-viewport invariants also hold on the WebKit engine.
 */

test.use({
  browserName: "webkit",
  channel: undefined,
  ...devices["iPhone 13"],
});

const RE_URL = "/search?vertical=real_estate&q=butas";

async function openSearch(
  page: Page,
  url = RE_URL,
  theme: "light" | "dark" = "light"
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
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
}

test.describe("22A.2-C/H — WebKit iPhone fold→unfold→fold (LIGHT + DARK)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WebKit ${theme}: 390→768→1200→768→390 without reload; state + presentation survive`, async ({
      page,
    }) => {
      await openSearch(page, RE_URL, theme);
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      // Wait for any async AI facet interpretation to settle, THEN record the
      // canonical URL — resize must not mutate it afterwards.
      await expect
        .poll(async () => page.url(), { timeout: 10_000 })
        .toContain("vertical=real_estate");
      await page.waitForTimeout(500);
      const urlBefore = page.url();

      for (const vp of [
        { width: 768, height: 1024 },
        { width: 1200, height: 900 },
        { width: 768, height: 1024 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(300);
        await expect(page.locator("[data-listing-card]").first()).toBeVisible({
          timeout: 15_000,
        });
        expect(await horizontalOverflowPx(page), `overflow at ${vp.width}`).toBe(0);
        expect(page.url(), `URL stable at ${vp.width}`).toBe(urlBefore);
      }

      // Presentation adapted: wide => grid, narrow => LIST.
      await page.setViewportSize({ width: 1200, height: 900 });
      await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
        timeout: 15_000,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 15_000,
      });

      // Bottom nav safe at final mobile.
      const nav = page.locator("[data-mobile-bottom-nav]:visible").first();
      await expect(nav).toBeVisible({ timeout: 10_000 });
      const nb = await nav.boundingBox();
      expect(nb).toBeTruthy();
      expect(nb!.y).toBeGreaterThanOrEqual(-0.5);
      expect(nb!.y + nb!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
    });
  }
});

test.describe("22A.2-L — WebKit listing detail continuity (LIGHT + DARK)", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`WebKit ${theme}: same listing across resize; essential content not covered`, async ({
      page,
    }) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("vauto_app_theme_v1", t);
        } catch {
          // about:blank has no origin — ignore.
        }
        document.documentElement?.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/listing/?id=lt-auto-001", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({
        timeout: 25_000,
      });
      const detail = page.locator("[data-listing-detail-2]").first();
      await expect(detail.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      const titleBefore = await detail.locator("h1").first().innerText();

      for (const vp of [
        { width: 640, height: 800 },
        { width: 1200, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(300);
        await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 10_000 });
        expect(await detail.locator("h1").first().innerText()).toBe(titleBefore);
        expect(await horizontalOverflowPx(page)).toBe(0);
      }

      // Essential content reachable at final mobile: sticky mobile contact bar
      // is the primary CTA. Listing detail uses AppShell hideNav (no bottom nav),
      // so the mobile action bar is the "sticky action" that must stay reachable
      // and must not permanently cover essential content.
      // Desktop sticky panel also carries a CTA; the mobile fixed bar is the
      // visible one at 390px. Filter to the visible instance.
      const actionBar = page
        .locator("[data-listing-message-cta]")
        .filter({ visible: true })
        .first();
      await expect(actionBar).toBeVisible({ timeout: 10_000 });
      const barBox = await actionBar.boundingBox();
      expect(barBox).toBeTruthy();
      expect(barBox!.x, "CTA x").toBeGreaterThanOrEqual(-0.5);
      expect(barBox!.x + barBox!.width, "CTA right").toBeLessThanOrEqual(
        page.viewportSize()!.width + 0.5
      );
      expect(barBox!.y, "CTA on-screen").toBeGreaterThanOrEqual(0);
      expect(barBox!.y + barBox!.height, "CTA inside viewport").toBeLessThanOrEqual(
        page.viewportSize()!.height + 0.5
      );

      // Title is above the sticky bar (not permanently covered). Scroll to top
      // first so the title is in view, then compare against the fixed bar.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect
        .poll(async () => await page.evaluate(() => window.scrollY), { timeout: 5_000 })
        .toBeLessThanOrEqual(2);
      const titleBox = await detail.locator("h1").first().boundingBox();
      expect(titleBox).toBeTruthy();
      expect(titleBox!.y, "title top above CTA").toBeLessThan(barBox!.y);

      // User-safe invariant: at full scroll, the last essential action inside the
      // detail clears the sticky bar (content reachable, not hidden behind it).
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const lastAction = page
        .locator("[data-listing-detail-2] a, [data-listing-detail-2] button")
        .last();
      await expect
        .poll(async () => {
          const b = await lastAction.boundingBox();
          if (!b) return -1;
          const nb = await actionBar.boundingBox();
          if (!nb) return -1;
          return b.y + b.height;
        })
        .toBeLessThan((await actionBar.boundingBox())!.y);
      await lastAction.focus();
      await expect(lastAction).toBeFocused();
    });
  }
});

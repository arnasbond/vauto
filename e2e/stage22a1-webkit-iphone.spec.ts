import { test, expect, type Page } from "@playwright/test";
import { devices } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.1-C — APPLE / WEBKIT MOBILE GATE
 *
 * iPhone-class (~390px) WebKit emulation: LIGHT + DARK, search results, filter
 * drawer, LIST view, explicit GRID selection, listing detail, bottom
 * navigation / sticky actions. Verifies zero page horizontal overflow, no
 * unintended overlaps, safe wrapping, reachable controls, drawer fits the
 * viewport, and sticky/fixed elements never cover essential content.
 *
 * browserName must be set at FILE level (test.use at describe level forces a
 * new worker and Playwright rejects it), hence this dedicated spec.
 */

test.use({
  browserName: "webkit",
  channel: undefined,
  ...devices["iPhone 13"],
});

async function openSearch(
  page: Page,
  url = "/search?vertical=transport&q=Volvo",
  theme: "light" | "dark" = "light"
) {
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_app_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
}

async function boxesOf(page: Page, selector: string) {
  const boxes: Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }> =
    await page.$$eval(selector, (els) =>
      els
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        })
    );
  return boxes;
}

function intersectionArea(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

/** Convert Playwright's {x,y,width,height} box into {left,top,right,bottom}. */
function toBox(b: { x: number; y: number; width: number; height: number }) {
  return {
    left: b.x,
    top: b.y,
    right: b.x + b.width,
    bottom: b.y + b.height,
    width: b.width,
    height: b.height,
  };
}

async function assertInsideViewport(page: Page, selector: string, label: string) {
  const boxes = await boxesOf(page, selector);
  expect(boxes.length, `${label}: found elements`).toBeGreaterThan(0);
  const vw = page.viewportSize()!.width;
  for (const b of boxes) {
    expect(b.left, `${label}: left >= 0`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${label}: right <= viewport (${b.right} > ${vw})`).toBeLessThanOrEqual(vw + 0.5);
    expect(b.width, `${label}: has width`).toBeGreaterThan(0);
  }
}

test.describe("22A.1-C — WebKit/iPhone mobile gate", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`iPhone ${theme}: search results — zero overflow, readable LIST, controls inside viewport`, async ({
      page,
    }) => {
      await openSearch(page, "/search?vertical=transport&q=Volvo", theme);
      // Narrow-mobile automatic default is the readable single-column LIST.
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
        timeout: 25_000,
      });
      // No forced dense 2-column grid as the automatic default.
      expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
      expect(await horizontalOverflowPx(page)).toBe(0);
      for (const sel of [
        "[data-marketplace-filter-bar]",
        "[data-facet-drawer-trigger]",
        "[data-view-mode]",
        "[data-mobile-bottom-nav]",
      ]) {
        await assertInsideViewport(page, sel, sel);
      }
      // View-mode buttons do not overlap.
      const modes = await boxesOf(page, "[data-view-mode]");
      for (let i = 0; i < modes.length; i++) {
        for (let j = i + 1; j < modes.length; j++) {
          expect(
            intersectionArea(modes[i], modes[j]),
            `view-mode overlap ${i}/${j}`
          ).toBeLessThanOrEqual(1);
        }
      }
      // REAL GEOMETRY (audit blocker B3): bottom nav vs first result.
      const nav = page.locator("[data-mobile-bottom-nav]:visible").first();
      await expect(nav).toBeVisible({ timeout: 15_000 });
      const navBox = await nav.boundingBox();
      expect(navBox).toBeTruthy();
      const vw = page.viewportSize()!.width;
      const vh = page.viewportSize()!.height;
      // nav stays fully inside the viewport (horizontal AND vertical).
      expect(navBox!.x).toBeGreaterThanOrEqual(-0.5);
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(vw + 0.5);
      expect(navBox!.y).toBeGreaterThanOrEqual(-0.5);
      expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(vh + 0.5);
      // first result card is NOT permanently obscured by the nav (top position).
      const cardBox = await page.locator("[data-listing-card]").first().boundingBox();
      expect(cardBox).toBeTruthy();
      expect(
        intersectionArea(toBox(navBox!), toBox(cardBox!)),
        `first result x nav overlap = ${intersectionArea(toBox(navBox!), toBox(cardBox!)).toFixed(1)}px²`
      ).toBeLessThanOrEqual(1);
      // user-safe invariant: scroll to bottom, last card clears the fixed nav.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect
        .poll(async () => {
          const b = await page.locator("[data-listing-card]").last().boundingBox();
          if (!b) return -1;
          const nb = await nav.boundingBox();
          if (!nb) return -1;
          return b.y + b.height;
        })
        .toBeLessThan((await nav.boundingBox())!.y);
    });

    test(`iPhone ${theme}: filter drawer fits viewport`, async ({ page }) => {
      await openSearch(page, "/search?vertical=transport&q=Volvo", theme);
      await page.locator("[data-facet-drawer-trigger]").first().click();
      const drawer = page.locator("[data-facet-drawer]");
      await expect(drawer).toBeVisible({ timeout: 15_000 });
            // The drawer container never exceeds the viewport width.
            const d = await drawer.boundingBox();
            expect(d).toBeTruthy();
            expect(d!.x).toBeGreaterThanOrEqual(-0.5);
            expect(d!.x + d!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
      // The drawer's inner controls are reachable.
      await expect(page.locator("[data-facet-apply]")).toBeVisible();
      await page.keyboard.press("Escape");
    });

    test(`iPhone ${theme}: explicit GRID selection renders dense grid without overflow`, async ({
      page,
    }) => {
      await openSearch(page, "/search?vertical=transport&q=Volvo", theme);
      await page.getByRole("button", { name: "Tinklelis" }).first().click();
      await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
        timeout: 25_000,
      });
      expect(await horizontalOverflowPx(page)).toBe(0);
    });

    test(`iPhone ${theme}: listing detail renders inside viewport with sticky actions`, async ({
      page,
    }) => {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto("/listing/?id=lt-auto-001", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({
        timeout: 25_000,
      });
      expect(await horizontalOverflowPx(page)).toBe(0);

      // Bottom navigation / sticky action bar must stay inside the viewport.
      const nav = page.locator("[data-mobile-bottom-nav]");
      let navBox: { x: number; y: number; width: number; height: number } | null = null;
      if ((await nav.count()) > 0 && (await nav.isVisible().catch(() => false))) {
        navBox = await nav.boundingBox();
        expect(navBox).toBeTruthy();
        expect(navBox!.x).toBeGreaterThanOrEqual(-0.5);
        expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(
          page.viewportSize()!.width + 0.5
        );
        expect(navBox!.y).toBeGreaterThanOrEqual(-0.5);
        expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(
          page.viewportSize()!.height + 0.5
        );
      }

      // REAL GEOMETRY (audit blocker C6): listing-detail essential content must
      // never be permanently covered by fixed navigation.
      // 1) The primary detail body (canonical info) must sit ABOVE the nav's top
      //    edge at initial scroll — assert real bounding boxes, not comments.
      const detail = page.locator("[data-listing-detail-2]").first();
      const detailBox = await detail.boundingBox();
      expect(detailBox).toBeTruthy();
      if (navBox) {
        // The detail top must start above the nav (content scrolls behind it only
        // while the user scrolls; the top of the document is not covered).
        expect(
          detailBox!.top,
          "detail top must be above the fixed nav"
        ).toBeLessThan(navBox.y);
      }

      // 2) User-safe invariant: the bottom-most essential detail content (the
      //    final actionable block) can be scrolled fully above the fixed nav —
      //    the page bottom padding (pb-[calc(4.25rem+env(safe-area-inset-bottom))])
      //    provides scroll clearance so no control is permanently hidden.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      if (navBox) {
        // Find the last interactive/actionable element inside the detail and
        // assert it clears the nav (its bottom is above nav top).
        const lastAction = page
          .locator("[data-listing-detail-2] a, [data-listing-detail-2] button")
          .last();
        await expect
          .poll(async () => {
            const b = await lastAction.boundingBox();
            if (!b) return -1;
            const nb = await nav.boundingBox();
            if (!nb) return -1;
            return b.y + b.height;
          })
          .toBeLessThan((await nav.boundingBox())!.y);
        // And that action is reachable (Playwright can focus it).
        await lastAction.focus();
        await expect(lastAction).toBeFocused();
      }
    });
  }
});

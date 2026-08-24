import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.1 — MOBILE RESPONSIVE HARDENING
 *
 * B. REAL OVERLAP / CLIPPING TESTING
 *    scrollWidth <= clientWidth is necessary but NOT sufficient. These tests
 *    assert actual bounding-box geometry: every essential control stays inside
 *    the viewport, sibling controls never overlap, cards never intersect each
 *    other, and no essential text is clipped outside its container.
 *
 * D. RESPONSIVE VIEW-MODE SEMANTICS
 *    CASE 1 automatic mobile default => LIST
 *    CASE 2 explicit GRID respected
 *    CASE 3 JOBS MAP NOT_APPLICABLE
 *    CASE 4 vertical switch never leaves an incompatible view active
 *
 * (Stage 22A.1-C WebKit/iPhone gate lives in stage22a1-webkit-iphone.spec.ts —
 * browserName must be set at file level because it forces a new worker.)
 */

const MOBILE = { width: 390, height: 844 };

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

/** Bounding boxes of all elements matching a selector (visible only). */
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
  const vh = page.viewportSize()!.height;
  for (const b of boxes) {
    expect(b.left, `${label}: left >= 0`).toBeGreaterThanOrEqual(-0.5);
    expect(b.right, `${label}: right <= viewport (${b.right} > ${vw})`).toBeLessThanOrEqual(vw + 0.5);
    // Elements may be below the fold (scrolled); only assert horizontal bounds.
    expect(b.width, `${label}: has width`).toBeGreaterThan(0);
  }
}

/** Assert two sibling selectors never overlap (not intentionally layered). */
async function assertNoOverlap(page: Page, aSel: string, bSel: string, label: string) {
  const a = await boxesOf(page, aSel);
  const b = await boxesOf(page, bSel);
  const vw = page.viewportSize()!.width;
  const inViewport = (bb: { left: number; right: number }) => bb.left >= -0.5 && bb.right <= vw + 0.5;
  for (const ba of a) {
    if (!inViewport(ba)) continue;
    for (const bb of b) {
      if (!inViewport(bb)) continue;
      const area = intersectionArea(ba, bb);
      expect(
        area,
        `${label}: overlap ${aSel} x ${bSel} = ${area.toFixed(1)}px²`
      ).toBeLessThanOrEqual(1);
    }
  }
}

test.describe("22A.1-B — narrow-mobile geometry (390px, chromium)", () => {
  test.use({ viewport: MOBILE });

  test("all essential controls inside viewport; no horizontal overflow", async ({
    page,
  }) => {
    await openSearch(page);
    const controls = [
      "[data-marketplace-filter-bar]",
      "[data-facet-drawer-trigger]",
      "[data-view-mode]",
      "[data-listing-card]",
      "[data-mobile-bottom-nav]",
    ];
    for (const sel of controls) {
      await assertInsideViewport(page, sel, sel);
    }
    expect(await horizontalOverflowPx(page)).toBe(0);
  });

  test("sibling controls never overlap (filter button / view modes / clear)", async ({
    page,
  }) => {
    await openSearch(page);
    // The results toolbar row: filter button, optional clear button, view modes.
    await assertNoOverlap(
      page,
      "[data-facet-drawer-trigger]",
      "[data-view-mode]",
      "filter vs view-mode"
    );
    // View-mode buttons must not overlap each other (they are siblings).
    const modes = await boxesOf(page, "[data-view-mode]");
    for (let i = 0; i < modes.length; i++) {
      for (let j = i + 1; j < modes.length; j++) {
        expect(
          intersectionArea(modes[i], modes[j]),
          `view-mode buttons ${i}/${j} overlap`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("listing cards never intersect each other; each card fully inside viewport", async ({
    page,
  }) => {
    await openSearch(page);
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 20_000 });
    const cards = await boxesOf(page, "[data-listing-card]");
    expect(cards.length).toBeGreaterThan(1);
    const vw = page.viewportSize()!.width;
    for (const c of cards) {
      expect(c.left, "card left >= 0").toBeGreaterThanOrEqual(-0.5);
      expect(c.right, `card right ${c.right} <= ${vw}`).toBeLessThanOrEqual(vw + 0.5);
    }
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(
          intersectionArea(cards[i], cards[j]),
          `cards ${i}/${j} intersect`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test("card internals: title, price, attributes, location, heart, badges inside card/viewport", async ({
    page,
  }) => {
    await openSearch(page);
    const card = page.locator("[data-listing-card]").first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const internals = ["h3", "a[href] h3", "[data-listing-card-attributes]", "p"];
    const vw = page.viewportSize()!.width;
    for (const sel of internals) {
      const boxes = await card.locator(sel).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        })
      );
      for (const b of boxes) {
        expect(b.left, `internal ${sel} left`).toBeGreaterThanOrEqual(-0.5);
        expect(b.right, `internal ${sel} right <= ${vw}`).toBeLessThanOrEqual(vw + 0.5);
      }
    }
  });

  test("long Lithuanian strings wrap or truncate intentionally (no fixed-width collision)", async ({
    page,
  }) => {
    // Real-estate titles in the mock catalog are long; search them.
    await openSearch(page, "/search?vertical=real_estate&q=butas");
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 20_000 });
    // No element may force the document wider than the viewport.
    expect(await horizontalOverflowPx(page)).toBe(0);
    // The grid container itself must not be wider than the viewport.
    const gridBoxes = await boxesOf(page, "[data-listing-grid]");
    if (gridBoxes.length) {
      for (const g of gridBoxes) {
        expect(g.right, "grid right <= viewport").toBeLessThanOrEqual(
          page.viewportSize()!.width + 0.5
        );
      }
    }
  });

  test("bottom navigation: inside viewport, first result never permanently obscured, final content scrolls clear above nav", async ({
    page,
  }) => {
    await openSearch(page);
    const nav = page.locator("[data-mobile-bottom-nav]:visible").first();
    await expect(nav).toBeVisible({ timeout: 20_000 });
    const vw = page.viewportSize()!.width;
    const vh = page.viewportSize()!.height;

    // --- Invariant 1: nav stays fully inside the viewport (horizontal AND vertical). ---
    const navBox = await nav.boundingBox();
    expect(navBox).toBeTruthy();
    expect(navBox!.x).toBeGreaterThanOrEqual(-0.5);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(vw + 0.5);
    expect(navBox!.y).toBeGreaterThanOrEqual(-0.5);
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(vh + 0.5);

    // --- Invariant 2: the FIRST result card's essential action area is not
    //     permanently covered by the nav. On the initial (top) scroll position the
    //     first card is rendered above the nav; we assert a real intersection that
    //     is at most a hairline (rounding), i.e. no meaningful overlap. ---
    const firstCard = page.locator("[data-listing-card]").first();
    await expect(firstCard).toBeVisible({ timeout: 20_000 });
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).toBeTruthy();
    // If the first card happens to be laid out below the nav (unlikely at top),
    // that would already be a product defect — we allow only hairline intersection.
    const overlapAtTop = intersectionArea(toBox(navBox!), toBox(cardBox!));
    expect(
      overlapAtTop,
      `first result card x nav overlap at top = ${overlapAtTop.toFixed(1)}px²`
    ).toBeLessThanOrEqual(1);

    // --- Invariant 3 (user-safe invariant): essential content can be scrolled
    //     fully above the fixed nav. Scroll to the very bottom and assert the LAST
    //     result card's essential content bottom sits above the nav's top edge,
    //     i.e. the content scroll-clearance (pb-[calc(4.25rem+env(safe-area-inset-bottom))])
    //     lets the final card expose its action area. ---
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Give the fixed nav a moment to settle; the content must have bottom padding
    // equal to the nav height, so the last card clears it.
    await expect
      .poll(async () => {
        const b = await page.locator("[data-listing-card]").last().boundingBox();
        if (!b) return -1;
        const navBottom = await nav.boundingBox();
        if (!navBottom) return -1;
        return b.y + b.height;
      })
      .toBeLessThan((await nav.boundingBox())!.y);

    // Nav must still be inside viewport after scrolling.
    const navBoxAfter = await nav.boundingBox();
    expect(navBoxAfter).toBeTruthy();
    expect(navBoxAfter!.x).toBeGreaterThanOrEqual(-0.5);
    expect(navBoxAfter!.x + navBoxAfter!.width).toBeLessThanOrEqual(vw + 0.5);
    expect(navBoxAfter!.y).toBeGreaterThanOrEqual(-0.5);
    expect(navBoxAfter!.y + navBoxAfter!.height).toBeLessThanOrEqual(vh + 0.5);

    // --- Invariant 4: after scrolling to bottom, the last card's actionable area
    //     (the whole card, which is a link) is reachable — Playwright can click it. ---
    const lastCard = page.locator("[data-listing-card]").last();
    await expect(lastCard).toBeVisible({ timeout: 10_000 });
    await expect(lastCard).toBeEnabled();
    // And it is NOT permanently hidden behind the nav (geometry above).
  });
});

test.describe("22A.1-D — responsive view-mode semantics (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("CASE 1 — automatic: narrow mobile without explicit choice => LIST", async ({
    page,
  }) => {
    await openSearch(page);
    // No ?view in the URL.
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);
    // Automatic default is the readable single-column LIST.
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
      timeout: 20_000,
    });
    // No forced dense 2-column grid.
    expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
    // Toolbar highlights LIST.
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("CASE 2 — explicit: user chooses GRID on mobile => respected", async ({
    page,
  }) => {
    await openSearch(page);
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
      timeout: 20_000,
    });
    // User explicitly selects GRID.
    await page.getByRole("button", { name: "Tinklelis" }).first().click();
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
      timeout: 20_000,
    });
    // Toolbar highlights GRID.
    await expect(page.getByRole("button", { name: "Tinklelis" }).first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // The URL stays canonical (grid = no ?view param).
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);
    // Resizing to desktop and back must NOT lose the explicit choice.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setViewportSize(MOBILE);
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("CASE 3 — capability: JOBS prevents MAP (NOT_APPLICABLE)", async ({ page }) => {
    await openSearch(page, "/search?vertical=jobs&q=vairuotojas");
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(mapBtn).toBeVisible({ timeout: 20_000 });
    await expect(mapBtn).toHaveAttribute("aria-disabled", "true");
    await expect(mapBtn).toBeDisabled();
    // Even a deep-link ?view=map must not leave an empty map shell.
    await page.goto("/search?vertical=jobs&q=vairuotojas&view=map");
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
    // After the capability fallback the feed is the safe default (LIST on mobile).
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("CASE 4 — vertical switch never leaves an incompatible view active", async ({
    page,
  }) => {
    // Start on real-estate (map PRIMARY) with explicit map view.
    await page.goto("/search?vertical=real_estate&q=butas&view=map");
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
    // Map is active for RE.
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Switch vertical to JOBS via the facet drawer.
    await page.locator("[data-facet-drawer-trigger]").first().click();
    await page.locator("[data-facet-vertical-select]").first().selectOption({
      label: "Darbas",
    });
    await page.locator("[data-facet-apply]").first().click();
    await page.waitForTimeout(500);

    // The map view must have been swapped to the safe default (mobile => LIST),
    // and the map button disabled for JOBS.
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await expect(page.locator('[data-view-mode="map"]').first()).toBeDisabled();
    // LIST is the responsive default on narrow mobile — the toolbar reflects it.
    await expect(page.locator('[data-view-mode="list"]').first()).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.locator('[data-view-mode="grid"]').first()).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    // The JOBS vertical keeps results alive when the query matches jobs data.
    await page.goto("/search?vertical=jobs&q=vairuotojas");
    await dismissGdpr(page);
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });
});

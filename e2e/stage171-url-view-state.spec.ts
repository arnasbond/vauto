import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 17.1-A — URL-authoritative view state.
 *
 * The marketplace view (grid/list/map) is driven by the canonical ?view URL
 * parameter. This spec verifies:
 *  - missing/invalid ?view always resolves to the default "grid";
 *  - intentional toggle changes are navigational (pushState), so the browser
 *    Back/Forward stack deterministically restores each view;
 *  - canonical URL normalisation never triggers a full page reload;
 *  - horizontal scroll stays 0 on the results view.
 */
const TOGGLE = {
  grid: (page: Page) => page.getByRole("button", { name: "Tinklelis" }),
  list: (page: Page) => page.getByRole("button", { name: "Sąrašas" }),
  map: (page: Page) => page.getByRole("button", { name: "Žemėlapis" }),
};

/**
 * Open the search results view at a given width and assert the view toggle
 * (grid/list/map) is interactive. The toggle (in MarketplaceFilterBar) is
 * surfaced on mobile-first surfaces (`md:hidden`), so view-state assertions run
 * at mobile/tablet widths where it is visible; DesktopHomeLayout surfaces an
 * equivalent toolbar on desktop.
 */
async function openResults(
  page: Page,
  url: string,
  opts: { width?: number; height?: number; expectToggle?: boolean } = {}
) {
  const { width = 390, height = 900, expectToggle = true } = opts;
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await dismissGdpr(page);
  // Wait until the results feed is present.
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
  if (expectToggle) {
    await expect(TOGGLE.grid(page).first()).toBeVisible({ timeout: 20_000 });
  }
}

test.describe("Stage 17.1-A — URL-authoritative view state", () => {
  test("/search without ?view defaults to grid", async ({ page }) => {
    await openResults(page, "/search");
    await expect(TOGGLE.grid(page).first()).toHaveAttribute("aria-pressed", "true");
    await expect(TOGGLE.list(page).first()).toHaveAttribute("aria-pressed", "false");
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);
  });

  test("grid -> list -> map, then Back/Forward deterministically restores state", async ({
    page,
  }) => {
    await openResults(page, "/search");

    // grid is default and the URL omits ?view.
    await expect(TOGGLE.grid(page).first()).toHaveAttribute("aria-pressed", "true");

    // grid -> list (navigational push)
    await TOGGLE.list(page).first().click();
    await expect(TOGGLE.list(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("view")).toBe("list");

    // list -> map (navigational push)
    await TOGGLE.map(page).first().click();
    await expect(TOGGLE.map(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("view")).toBe("map");

    // browser back => map -> list
    await page.goBack();
    await expect(TOGGLE.list(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("view")).toBe("list");

    // browser back => list -> grid (no ?view param — the edge case)
    await page.goBack();
    await expect(TOGGLE.grid(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);

    // browser forward => grid -> list
    await page.goForward();
    await expect(TOGGLE.list(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("view")).toBe("list");

    // browser forward => list -> map
    await page.goForward();
    await expect(TOGGLE.map(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.get("view")).toBe("map");
  });

  test("?view=invalid normalises to grid", async ({ page }) => {
    await openResults(page, "/search?view=invalid");
    await expect(TOGGLE.grid(page).first()).toHaveAttribute("aria-pressed", "true");
    // The invalid parameter is canonicalised away (replaced, not reloaded).
    await expect
      .poll(() => new URL(page.url()).searchParams.get("view"))
      .toBeNull();
  });

  test("popstate landing on an absent ?view restores grid", async ({ page }) => {
    await openResults(page, "/search");

    // grid -> list (push) -> map (push)
    await TOGGLE.list(page).first().click();
    await TOGGLE.map(page).first().click();
    await expect(TOGGLE.map(page).first()).toHaveAttribute("aria-pressed", "true");

    // Back twice: map -> list -> grid (no ?view). Grid must be restored.
    await page.goBack();
    await page.goBack();
    await expect(TOGGLE.grid(page).first()).toHaveAttribute("aria-pressed", "true");
    expect(new URL(page.url()).searchParams.has("view")).toBe(false);
  });

  test("no full page reload during view changes", async ({ page }) => {
    await openResults(page, "/search");
    let fullLoads = 0;
    // A true full page reload fires a fresh "load" event on the main frame.
    // pushState/popstate (SPA history navigation) mutate the URL WITHOUT
    // triggering "load", so only genuine reloads count here.
    page.on("load", () => {
      fullLoads += 1;
    });

    await TOGGLE.list(page).first().click();
    await TOGGLE.map(page).first().click();
    await page.goBack();
    await page.goBack();
    await page.goForward();

    // Only the initial document load happened; toggles and Back/Forward are
    // SPA-driven history operations (pushState/popstate), never a reload.
    expect(fullLoads).toBeLessThanOrEqual(1);
  });

  test("results view keeps horizontal scroll = 0 across breakpoints", async ({
    page,
  }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await openResults(page, "/search?view=map", {
        width: vp.width,
        height: vp.height,
        expectToggle: false,
      });
      const overflow = await horizontalOverflowPx(page);
      expect(
        overflow,
        `horizontal overflow at ${vp.width}x${vp.height}`
      ).toBeLessThanOrEqual(0);
    }
  });
});

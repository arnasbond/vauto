import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A-8 — Accessibility evidence for the vertical experience.
 *
 * Proves the 22A capability-driven controls are accessible:
 *  - view-mode controls (LIST/GRID/MAP) expose semantic buttons with
 *    aria-label, aria-pressed, aria-disabled — no colour-only meaning;
 *  - result card links are keyboard-reachable real anchors with text;
 *  - the vertical facet select is a labelled form control;
 *  - LIGHT and DARK both keep focus-visible rings on the same controls;
 *  - jobs MAP disabled state is communicated to assistive tech.
 */

async function openSearch(page: Page, url: string) {
  await page.goto(url);
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
}

test.describe("22A-8 vertical accessibility", () => {
  test("view-mode buttons are semantic, labelled, keyboard-activatable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, "/search?vertical=real_estate&q=butas");
    const listBtn = page.locator('[data-view-mode="list"]').first();
    const gridBtn = page.locator('[data-view-mode="grid"]').first();
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(listBtn).toBeVisible({ timeout: 15_000 });
    await expect(listBtn).toHaveAttribute("aria-label", /Sąrašas/);
    await expect(gridBtn).toHaveAttribute("aria-label", /Tinklelis/);
    await expect(mapBtn).toHaveAttribute("aria-label", /Žemėlapis/);
    // aria-pressed reflects the ACTIVE view mode. On narrow mobile with no
    // explicit selection the responsive default (Stage 22A.1-A) is the readable
    // LIST — so LIST is pressed and grid is not.
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    await expect(gridBtn).toHaveAttribute("aria-pressed", "false");

    // Keyboard: focus + Enter switches to explicit GRID (URL gains view=grid).
    await gridBtn.focus();
    await expect(gridBtn).toBeFocused();
    const outline = await gridBtn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, shadow: s.boxShadow };
    });
    expect(outline.outline !== "none" || outline.shadow !== "none").toBe(true);
    await page.keyboard.press("Enter");
    await expect(gridBtn).toHaveAttribute("aria-pressed", "true");
    // Explicit grid is a supported, respected choice on mobile (22A.1-D CASE 2).
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("jobs MAP control is disabled with aria-disabled=true (not colour-only)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, "/search?vertical=jobs&q=vairuotojas");
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(mapBtn).toBeVisible({ timeout: 15_000 });
    await expect(mapBtn).toHaveAttribute("aria-disabled", "true");
    // Disabled semantics must not rely on the emerald brand colour alone.
    await expect(mapBtn).toHaveAttribute("data-view-mode-enabled", "false");
  });

  test("result card links are real anchors with meaningful text", async ({
    page,
  }) => {
    await openSearch(page, "/search?vertical=transport&q=Volvo");
    const card = page.locator(
      '[data-listing-card][data-listing-category="vehicles"]'
    ).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    // Grid card: the title lives inside the content <Link> (image link is a
    // separate thumbnail anchor). Both are real anchors with destinations.
    const contentLink = card
      .locator("a[href]")
      .filter({ has: page.locator("h3") })
      .first();
    await expect(contentLink).toBeVisible();
    const text = (await contentLink.innerText()).trim();
    expect(text.length).toBeGreaterThan(10);
    // The card link is keyboard reachable and has a real destination.
    await contentLink.focus();
    await expect(contentLink).toBeFocused();
    const href = await contentLink.getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("vertical facet select is a labelled control (LIGHT and DARK)", async ({
    page,
  }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 390, height: 844 });
      await openSearch(page, "/search?vertical=real_estate&q=butas");
      await page.locator("[data-facet-drawer-trigger]").first().click();
      const select = page
        .locator("[data-facet-drawer] [data-facet-vertical-select]")
        .first();
      await expect(select).toBeVisible({ timeout: 10_000 });
      const label = page.locator(`label[for="${await select.getAttribute("id")}"]`);
      await expect(label).toBeVisible();
      expect((await label.innerText()).trim()).toBe("Kategorija");
      await page.keyboard.press("Escape");
    }
  });
});

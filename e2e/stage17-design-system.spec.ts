import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  categoryButtons,
  tabUntilFocused,
} from "./helpers/stage12b-comprehension";
import { seedDemoUser } from "./helpers/seed-demo-user";

/**
 * Stage 17B/17J — DESIGN SYSTEM E2E.
 *
 * Verifies the Stage 17 foundations on the shipped static export:
 *  - exactly two themes (LIGHT + DARK), no third/legacy theme is ever applied;
 *  - theme switching works and persists to <html data-app-theme>;
 *  - no horizontal overflow at 390 / 768 / 1440 / 1920;
 *  - keyboard navigation reaches the primary marketplace controls;
 *  - existing search + results feed still render.
 */
const VALID_THEMES = ["light", "dark"];

async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
}

async function openSettings(page: Page) {
  await seedDemoUser(page);
  await page.goto("/profile/settings");
  await dismissGdpr(page);
  await expect(page.getByRole("heading", { name: /Programėlės tema/i })).toHaveCount(
    1,
    { timeout: 20_000 }
  );
  await expect(page.getByRole("button", { name: /Tamsi tema/i })).toBeVisible();
}

async function appTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
}

test.describe("Stage 17 — Design System foundations", () => {
  test("exactly two themes: light default, dark toggles, no legacy theme", async ({
    page,
  }) => {
    await openHome(page, 1440, 900);

    // Light is the default and the document attribute is always a valid id.
    await expect
      .poll(() => appTheme(page))
      .toBe("light");
    const initial = await appTheme(page);
    expect(VALID_THEMES).toContain(initial);

    // Toggle to dark via the real settings control and verify persistence.
    await openSettings(page);
    await page.getByRole("button", { name: /Tamsi tema/i }).click();
    await expect
      .poll(() => appTheme(page))
      .toBe("dark");

    // Back to light.
    await page.getByRole("button", { name: /Šviesi tema/i }).click();
    await expect
      .poll(() => appTheme(page))
      .toBe("light");
  });

  test("theme attribute is never a third/legacy value", async ({ page }) => {
    for (const width of [390, 768, 1440, 1920]) {
      await openHome(page, width, 900);
      const theme = await appTheme(page);
      expect(
        VALID_THEMES,
        `data-app-theme (${theme}) at ${width}px must be light or dark, never legacy`
      ).toContain(theme as string);
      const overflow = await horizontalOverflowPx(page);
      expect(overflow, `no overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("no horizontal overflow across breakpoints (mobile/tablet/desktop/wide)", async ({
    page,
  }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await openHome(page, vp.width, vp.height);
      const overflow = await horizontalOverflowPx(page);
      expect(
        overflow,
        `horizontal overflow at ${vp.width}x${vp.height}`
      ).toBeLessThanOrEqual(0);
    }
  });

  test("keyboard navigation reaches primary marketplace controls", async ({
    page,
  }) => {
    await openHome(page, 390, 844);
    // Drive real Tab focus until a primary control receives focus.
    const focused = await tabUntilFocused(page, (el) => {
      const base = el.name.toLowerCase();
      return (
        base.includes("paieška") ||
        base.includes("skelbim") ||
        base.includes("kategorij") ||
        base.includes("pradžia")
      );
    });
    expect(focused.name.length).toBeGreaterThan(0);

    // The search control and category grid are still present and interactive.
    await expect(homeSearchbox(page)).toBeVisible();
    await expect(categoryButtons(page).first()).toBeVisible();
  });

  test("classic search + results feed still work", async ({ page }) => {
    await openHome(page, 1440, 900);
    const search = homeSearchbox(page);
    await expect(search).toBeVisible();
    await search.fill("automobilis");
    await search.press("Enter");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 12_000 });
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

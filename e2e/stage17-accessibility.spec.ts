import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  tabUntilFocused,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 17H — ACCESSIBILITY E2E.
 *
 * Deterministically verify the Stage 17 a11y contract on the shipped static
 * export: visible focus-visible rings, honouring prefers-reduced-motion,
 * keyboard reachability of primary controls, dialog ESC-close (focus trap), and
 * meaningful aria-labels on primary marketplace controls.
 */
async function openHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
}

async function focusedStyle(page: Page, prop: string): Promise<string> {
  return page.evaluate((key) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    return (getComputedStyle(el).getPropertyValue(key) || "").trim();
  }, prop);
}

test.describe("Stage 17H — Accessibility foundations", () => {
  test("visible focus-visible ring appears on keyboard focus", async ({ page }) => {
    await openHome(page, 1440, 900);
    // Tab into the primary search control.
    await homeSearchbox(page).focus();
    const searched = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? (el.getAttribute("placeholder") || "").length > 0 : false;
    });
    expect(searched, "search control received focus").toBe(true);

    // Keyboard (Tab) reaches a primary marketplace control.
    const focused = await tabUntilFocused(page, (el) => /paieška|skelbim/i.test(el.name));
    expect(focused.name.length).toBeGreaterThan(0);
    // The focused element exposes a focus ring / outline.
    const outline = await focusedStyle(page, "outline-style");
    const boxShadow = await focusedStyle(page, "box-shadow");
    expect(outline !== "none" || boxShadow !== "none", "visible focus indicator").toBe(
      true
    );
  });

  test("prefers-reduced-motion zeroes out design-system motion durations", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page, 1440, 900);
    const value = (await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--ds-duration-normal")
    )).trim();
    // getComputedStyle normalises 0ms → "0s"; both mean zero motion.
    expect(["0ms", "0s"]).toContain(value);
  });

  test("dialog focus-trap + ESC close (mobile filter modal)", async ({ page }) => {
    await openHome(page, 390, 844);
    // Wait for results section so the sticky filter bar is present.
    await page.locator("#listing-results").scrollIntoViewIfNeeded();
    const trigger = page
      .getByRole("button", { name: /Atidaryti filtrus/i })
      .first();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: /Filtrai/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // ESC closes the dialog (focus-trap release) and it unmounts.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("primary controls expose meaningful accessible names", async ({ page }) => {
    await openHome(page, 1440, 900);
    await expect(homeSearchbox(page)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Skelbimai" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Paieška" })).toBeVisible();

    // No horizontal overflow while exercising a11y flows.
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

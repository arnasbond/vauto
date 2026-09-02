import { test, expect } from "@playwright/test";
import { acceptGdprConsentIfPrompted, forceOfflineCatalog } from "./helpers/seed";

/**
 * F7 — branding closure smoke: the single VAUTO identity renders in the
 * header (desktop + mobile, light + dark), the mark is decorative (hidden
 * from AT), and the PWA manifest/favicon links point at the final assets.
 */

async function openWithTheme(
  page: import("@playwright/test").Page,
  theme: "light" | "dark"
) {
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_app_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await forceOfflineCatalog(page);
  await page.goto("/");
  await acceptGdprConsentIfPrompted(page);
}

test.describe("F7 — branding smoke", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 1280, height: 900 } });

  test("desktop: brand lockup renders in light and dark with one accessible name", async ({
    page,
  }) => {
    for (const theme of ["light", "dark"] as const) {
      await openWithTheme(page, theme);
      const logo = page.locator("[data-brand-logo]").first();
      await expect(logo).toBeVisible({ timeout: 20_000 });
      await expect(logo).toHaveAttribute("aria-label", "VAUTO");
      // Decorative parts stay hidden from assistive tech.
      const mark = page.locator("[data-brand-mark]").first();
      await expect(mark).toHaveAttribute("aria-hidden", "true");
      const wordmark = logo.getByText("VAUTO", { exact: true });
      await expect(wordmark.first()).toBeVisible();
    }
  });

  test("mobile: compact brand visible in light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ["light", "dark"] as const) {
      await openWithTheme(page, theme);
      await expect(page.locator("[data-brand-logo]").first()).toBeVisible({
        timeout: 20_000,
      });
    }
  });

  test("head links point at the final brand assets", async ({ page }) => {
    await openWithTheme(page, "light");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.json"
    );
    await expect(page.locator('link[rel~="icon"]').first()).toHaveAttribute(
      "href",
      /favicon\.ico/
    );
    await expect(
      page.locator('link[rel~="apple-touch-icon"]')
    ).toHaveAttribute("href", /apple-touch-icon\.png/);
  });
});

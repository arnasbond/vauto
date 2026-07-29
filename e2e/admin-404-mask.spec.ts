import { test, expect } from "@playwright/test";
import { seedAdminUser } from "./helpers/seed-demo-user";

/**
 * Guest /admin must look like a missing page (404 mask), not Control Center login.
 * Seeded admin must reach Control Center via /profile/.
 *
 *   PLAYWRIGHT_BASE_URL=https://www.vauto.lt npx playwright test e2e/admin-404-mask.spec.ts --config=playwright.prod-smoke.config.ts
 */
test.describe("Admin 404 masking", () => {
  test.setTimeout(90_000);

  test("guest /admin shows generic 404, not admin chrome", async ({ page }) => {
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await expect(page.getByText(/Puslapis nerastas/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/^404$/).first()).toBeVisible();

    await expect(page.getByText(/Control Center/i)).toHaveCount(0);
    await expect(page.getByText(/Administratoriaus įėjimas/i)).toHaveCount(0);
    await expect(page.getByText(/Prieiga uždrausta/i)).toHaveCount(0);
  });

  test("guest profile has no Control Center nav link", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await expect(page.getByText(/VAUTO Control Center/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /VAUTO CC/i })).toHaveCount(0);
  });

  test("seeded admin sees Control Center on /profile", async ({ page }) => {
    await seedAdminUser(page);
    await page.goto("/profile/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText(/VAUTO Control Center|Control Center|Moderavim/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});

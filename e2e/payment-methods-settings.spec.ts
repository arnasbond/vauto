import { test, expect } from "@playwright/test";
import { seedDemoUser, seedAdminUser, seedProUser } from "./helpers/seed-demo-user";

test.describe("Payment methods + cabinet surfaces", () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test("settings shows Mokėjimo ir išmokėjimo metodai card", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/profile/settings/");
    await expect(
      page.getByText(/Mokėjimo ir išmokėjimo metodai/i).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Duomenis saugo Stripe/i).first()).toBeVisible();
  });

  test("settings focus=payments scrolls to payment vault", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/profile/settings/?focus=payments");
    await expect(page.locator("#payment-methods")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Reikia mokėjimo duomenų|Mokėjimo ir išmokėjimo metodai/i).first()
    ).toBeVisible();
  });

  test("profile AI tab reachable for signed-in user", async ({ page }) => {
    await seedDemoUser(page);
    await page.goto("/profile/?tab=ai");
    // Mobile viewport uses the short tab label "AI"; prefer role + content.
    await expect(
      page.getByRole("tab", { name: /AI( asistentas)?/i }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/Mano AI Dvynio|AI Dvynio duomenys/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("admin Control Center shell loads for admin seed", async ({ page }) => {
    await seedAdminUser(page);
    await page.goto("/profile/");
    await expect(
      page.getByText(/VAUTO Control Center|Control Center|Moderavim/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("business /verslui landing is public and clean", async ({ page }) => {
    await page.goto("/verslui/");
    await expect(page.locator("body")).toContainText(/Versl|B2B|Pardav/i, {
      timeout: 15_000,
    });
  });

  test("pro user opens profile cabinet without guest gate", async ({ page }) => {
    await seedProUser(page);
    await page.goto("/profile/");
    await expect(page.getByText(/Prisijungti prie VAUTO/i)).toHaveCount(0);
  });
});

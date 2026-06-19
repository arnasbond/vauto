import { test, expect } from "@playwright/test";

test.describe("Vauto smoke", () => {
  test("home page loads with listings", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Vauto/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("profile gate shows login CTA for guests", async ({ page }) => {
    await page.goto("/profile/");
    await expect(page.getByText(/Prisijungti/i).first()).toBeVisible();
  });

  test("chats gate shows login CTA for guests", async ({ page }) => {
    await page.goto("/chats/");
    await expect(page.getByRole("heading", { name: "Pokalbiai" })).toBeVisible();
    await expect(page.getByText(/Prisijungti/i).first()).toBeVisible();
  });

  test("listing detail page renders", async ({ page }) => {
    await page.goto("/listing/dviratis-trek-panevezys/");
    await expect(page.locator("body")).toContainText(/dviratis|Dviratis/i);
  });

  test("install page accessible", async ({ page }) => {
    await page.goto("/install/");
    await expect(page.getByText(/įdiegti|Įdiegti/i).first()).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { seedDemoUser, seedAuthSession } from "./helpers/seed-demo-user";

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const E2E_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

test.describe("R4 Runtime Visual Evidence Capture", () => {
  test("1. Homepage LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("light");
    await page.screenshot({ path: "artifacts/runtime-homepage-light-desktop.png" });
  });

  test("2. Homepage DARK Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "dark");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("dark");
    await page.screenshot({ path: "artifacts/runtime-homepage-dark-desktop.png" });
  });

  test("3. Homepage LIGHT Mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("light");
    await page.screenshot({ path: "artifacts/runtime-homepage-light-mobile.png" });
  });

  test("4. Homepage DARK Mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "dark");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("dark");
    await page.screenshot({ path: "artifacts/runtime-homepage-dark-mobile.png" });
  });

  test("5. Search & Results LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/search/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-search-results.png" });
  });

  test("6. Listing Creation / Add LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/add/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-listing-creation.png" });
  });

  test("7. Profile / My VAUTO LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await seedDemoUser(page);
    await page.goto("/profile/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(/Prisijungti/i);
    await expect(page.locator("body")).toContainText(/E2E Tester/i);
    await page.screenshot({ path: "artifacts/runtime-profile-my-vauto.png" });
  });

  test("8. Verslui / Business LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/verslui/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-verslui-business.png" });
  });

  test("9. Chat & Deal Room LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await seedAuthSession(page, {
      id: "user-1",
      name: "E2E Tester",
      nickname: "E2E Tester",
      avatar: E2E_AVATAR,
      phone: "+37060000001",
      city: "Vilnius",
      role: "private",
      profileType: "private",
    });
    await page.goto("/chats/?id=chat-1");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(/404/i);
    await expect(page.locator("body")).not.toContainText(/Puslapis nerastas/i);
    await expect(page.locator("body")).toContainText(/iPhone 15 Pro/i);
    await page.screenshot({ path: "artifacts/runtime-chat-dealroom.png" });
  });
});

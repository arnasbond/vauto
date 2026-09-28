import { test, expect } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("R4 Runtime Visual Evidence Capture", () => {
  test("1. Homepage LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-homepage-light-desktop.png" });
  });

  test("2. Homepage DARK Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/");
    await page.evaluate(() => document.documentElement.setAttribute("data-app-theme", "dark"));
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-homepage-dark-desktop.png" });
  });

  test("3. Homepage LIGHT Mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-homepage-light-mobile.png" });
  });

  test("4. Homepage DARK Mobile", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/");
    await page.evaluate(() => document.documentElement.setAttribute("data-app-theme", "dark"));
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-homepage-dark-mobile.png" });
  });

  test("5. Search & Results LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/search/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-search-results.png" });
  });

  test("6. Listing Creation / Add LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/add/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-listing-creation.png" });
  });

  test("7. Profile / My VAUTO LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/profile/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-profile-my-vauto.png" });
  });

  test("8. Verslui / Business LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/verslui/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-verslui-business.png" });
  });

  test("9. Chat & Deal Room LIGHT Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto("/chats/c-demo-1/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-chat-dealroom.png" });
  });
});

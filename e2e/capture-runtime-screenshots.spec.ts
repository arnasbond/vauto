import { test, expect } from "@playwright/test";
import { seedDemoUser, seedAuthSession } from "./helpers/seed-demo-user";

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const E2E_AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop";

test.describe("R4 Final Visual Evidence Capture (All 17 Required Surfaces)", () => {
  // 1. Homepage LIGHT Desktop
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

  // 2. Homepage DARK Desktop
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

  // 3. Homepage LIGHT Mobile 390px
  test("3. Homepage LIGHT Mobile 390px", async ({ page }) => {
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

  // 4. Homepage DARK Mobile 390px
  test("4. Homepage DARK Mobile 390px", async ({ page }) => {
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

  // 5. Search / Results Desktop
  test("5. Search / Results Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/search/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-search-results.png" });
  });

  // 6. Search / Results Mobile 390px
  test("6. Search / Results Mobile 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/search/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-search-results-mobile.png" });
  });

  // 7. Listing Detail Desktop
  test("7. Listing Detail Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/listing/?id=lt-auto-015");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(/Skelbimas nerastas/i);
    await page.screenshot({ path: "artifacts/runtime-listing-detail-desktop.png" });
  });

  // 8. Listing Detail Mobile 390px
  test("8. Listing Detail Mobile 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/listing/?id=lt-auto-015");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(/Skelbimas nerastas/i);
    await page.screenshot({ path: "artifacts/runtime-listing-detail-mobile.png" });
  });

  // 9. Listing Creation / Add Desktop
  test("9. Listing Creation / Add Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/add/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-listing-creation.png" });
  });

  // 10. Listing Creation / Add Mobile 390px
  test("10. Listing Creation / Add Mobile 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/add/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-listing-creation-mobile.png" });
  });

  // 11. Authenticated Mano VAUTO Desktop
  test("11. Authenticated Mano VAUTO Desktop", async ({ page }) => {
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

  // 12. Authenticated Mano VAUTO Mobile 390px
  test("12. Authenticated Mano VAUTO Mobile 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await seedDemoUser(page);
    await page.goto("/profile/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText(/Prisijungti/i);
    await expect(page.locator("body")).toContainText(/E2E Tester/i);
    await page.screenshot({ path: "artifacts/runtime-profile-my-vauto-mobile.png" });
  });

  // 13. Verslui First View Desktop
  test("13. Verslui First View Desktop", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/verslui/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-verslui-business.png" });
  });

  // 14. Verslui First View Mobile 390px
  test("14. Verslui First View Mobile 390px", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/verslui/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "artifacts/runtime-verslui-business-mobile.png" });
  });

  // 15. Chat / Deal Room State
  test("15. Chat / Deal Room State", async ({ page }) => {
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

  // 16. Representative 404/Error State LIGHT
  test("16. Representative 404 State LIGHT", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.goto("/non-existent-page-404/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("light");
    await page.screenshot({ path: "artifacts/runtime-404-error-light.png" });
  });

  // 17. Representative 404/Error State DARK
  test("17. Representative 404 State DARK", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.addInitScript(() => {
      localStorage.setItem("vauto_app_theme_v1", "dark");
    });
    await page.goto("/non-existent-page-404/");
    await page.waitForLoadState("networkidle");
    const theme = await page.evaluate(() => document.documentElement.getAttribute("data-app-theme"));
    expect(theme).toBe("dark");
    await page.screenshot({ path: "artifacts/runtime-404-error-dark.png" });
  });
});

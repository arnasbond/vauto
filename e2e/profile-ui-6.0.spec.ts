import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedDemoUser } from "./helpers/seed-demo-user";

const OUT = path.join("docs", "ui-profile-6.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

test.describe("Mano skelbimai + Profilis 6.0 snapshots", () => {
  test("mano-skelbimai desktop 1440x900", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mano-skelbimai/");
    await dismissGdpr(page);
    await expect(page.locator("[data-mano-skelbimai-2]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.locator("[data-mano-skelbimai-2]").getByRole("heading", {
        name: /Mano skelbimai/i,
      })
    ).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "mano-skelbimai-desktop.png"),
      fullPage: false,
    });
  });

  test("mano-skelbimai mobile 390x844", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mano-skelbimai/");
    await dismissGdpr(page);
    await expect(page.locator("[data-mano-skelbimai-2]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-mano-skelbimai-2] .ds-label, [data-mano-skelbimai-2]").first()).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "mano-skelbimai-mobile.png"),
      fullPage: false,
    });
  });

  test("profile desktop 1440x900", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/profile/");
    await dismissGdpr(page);
    await expect(page.locator("[data-profile-hero-2]")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("[data-profile-settings-2]")).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: path.join(OUT, "profile-desktop.png"),
      fullPage: false,
    });
  });

  test("profile mobile 390x844", async ({ page }) => {
    await seedDemoUser(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/profile/");
    await dismissGdpr(page);
    await expect(page.locator("[data-profile-hero-2]")).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: path.join(OUT, "profile-mobile.png"),
      fullPage: false,
    });
  });
});

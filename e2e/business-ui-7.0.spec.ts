import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedProUser } from "./helpers/seed-demo-user";

const OUT = path.join("docs", "ui-business-7.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function openBusinessPortal(page: import("@playwright/test").Page) {
  await seedProUser(page);
  await page.goto("/verslui/");
  await dismissGdpr(page);
  await expect(page.locator("[data-verslui-cockpit-7]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("[data-business-cockpit-7='kpi']")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Business Cockpit 7.0 snapshots", () => {
  test("desktop 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBusinessPortal(page);
    await expect(
      page.getByRole("heading", { name: /Verslo portalas/i })
    ).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "business-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBusinessPortal(page);
    await expect(page.getByText(/Pajamos/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "business-mobile.png"),
      fullPage: false,
    });
  });
});

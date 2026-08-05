import { test, expect } from "@playwright/test";
import path from "node:path";
import { seedAdminUser } from "./helpers/seed-demo-user";

const OUT = path.join("docs", "ui-control-center-8.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function openControlCenter(page: import("@playwright/test").Page) {
  await seedAdminUser(page);
  await page.goto("/profile/?tab=ops");
  await dismissGdpr(page);
  await expect(page.locator("[data-cc-mission-8='root']")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("[data-cc-mission-8='kpi']")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Control Center Mission Control 8.0 snapshots", () => {
  test("desktop 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openControlCenter(page);
    await expect(
      page.getByRole("heading", { name: /Control Center/i })
    ).toBeVisible();
    await expect(page.getByText(/Mission Control 2\.0/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "cc-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControlCenter(page);
    await expect(page.getByText(/Aktyvūs vartotojai/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(OUT, "cc-mobile.png"),
      fullPage: false,
    });
  });
});

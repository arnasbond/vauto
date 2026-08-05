import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join("docs", "ui-detail-5.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function openFirstListing(page: import("@playwright/test").Page) {
  await page.goto("/");
  await dismissGdpr(page);
  const card = page.locator("[data-listing-card]").first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const link = card.locator("a").first();
  await link.click();
  await expect(page.locator("[data-listing-detail-2]")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("body")).not.toContainText(/Skelbimas nerastas/i);
}

test.describe("Listing Detail 2.0 snapshots", () => {
  test("desktop 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openFirstListing(page);
    await expect(page.locator("[data-listing-sticky-panel]")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: path.join(OUT, "detail-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstListing(page);
    await expect(
      page.getByRole("button", { name: /Rašyti žinutę/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await page.screenshot({
      path: path.join(OUT, "detail-mobile.png"),
      fullPage: false,
    });
  });
});

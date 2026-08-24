import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join("docs", "ui-market-4.0");

async function dismissGdpr(page: import("@playwright/test").Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await accept.click();
  }
}

test.describe("Marketplace ListingCard 2.0 snapshots", () => {
  test("desktop grid 1440x900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-listing-card='grid']").first()).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("#listing-results").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(OUT, "market-desktop.png"),
      fullPage: false,
    });
  });

  test("mobile list 390x844 (Stage 22A.1-A automatic default)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await dismissGdpr(page);
    await expect(
      page.getByRole("button", { name: /Atidaryti filtrus|Filtrai/i })
    ).toBeVisible({ timeout: 15_000 });
    // Narrow-mobile automatic default is the readable single-column LIST —
    // never a forced dense 2-column grid.
    await expect(page.locator("[data-listing-card='list']").first()).toBeVisible({
      timeout: 20_000,
    });
    await page.locator("#listing-results").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(OUT, "market-mobile.png"),
      fullPage: false,
    });
  });
});

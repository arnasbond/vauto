import { test, expect, type Page } from "@playwright/test";
import { seedDemoUser } from "./helpers/seed-demo-user";
import {
  mockUnregisteredBarcodeLookup,
  runUnregisteredBarcodeAgentFlow,
} from "./helpers/barcode-agent-flow";

/** /add is a standalone manual form — wait for the photo/file input. */
async function waitForSellerAgentEntry(page: Page) {
  await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({ timeout: 20_000 });
  const fileInput = page.locator('[data-prepublish-modal="1"] input[type="file"]').first();
  await expect(fileInput).toBeVisible({ timeout: 20_000 });
}

test.describe("AI conductor flows", () => {
  test("add page exposes manual photo entry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDemoUser(page);
    await page.goto("/add/");
    await waitForSellerAgentEntry(page);
  });

  test("barcode registry miss shows proactive agent question and chips", async ({ page }) => {
    await mockUnregisteredBarcodeLookup(page);
    await runUnregisteredBarcodeAgentFlow(page);
  });
});

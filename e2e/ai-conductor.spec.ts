import { test, expect, type Page } from "@playwright/test";
import { seedDemoUser } from "./helpers/seed-demo-user";
import {
  mockUnregisteredBarcodeLookup,
  runUnregisteredBarcodeAgentFlow,
} from "./helpers/barcode-agent-flow";

async function waitForAddListingPage(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: /Kelkite skelbimą pokalbyje|Kelkite drabužį pokalbyje|Naujas skelbimas/i,
    })
  ).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("AI conductor flows", () => {
  test("add page exposes agent photo and barcode entry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDemoUser(page);
    await page.goto("/add/");
    await waitForAddListingPage(page);
    await expect(
      page.getByRole("button", { name: /Įkelti nuotraukas/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /Skenuoti brūkšninį/i }).first()
    ).toBeVisible();
  });

  test("barcode registry miss shows proactive agent question and chips", async ({ page }) => {
    await mockUnregisteredBarcodeLookup(page);
    await runUnregisteredBarcodeAgentFlow(page);
  });
});

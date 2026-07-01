import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { seedDemoUser } from "./seed-demo-user";

export const TEST_BARCODE = "5901234123457";

export const UNREGISTERED_BARCODE_BODY = {
  source: "barcode-unregistered",
  verified: false,
  confidence: 0.35,
  barcode: TEST_BARCODE,
  title: "",
  specs: [`EAN/UPC/ISBN: ${TEST_BARCODE}`],
  notFoundInRegistry: true,
  userMessage:
    "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys, o aš sugeneruosiu aprašymą.",
  technicalDescription: "Kodas atpažintas, bet nerastas viešame registre.",
};

export async function mockUnregisteredBarcodeLookup(page: Page) {
  await page.route("**/api/product/lookup", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(UNREGISTERED_BARCODE_BODY),
    });
  });
}

export async function runUnregisteredBarcodeAgentFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDemoUser(page);
  await page.goto("/add/");
  await expect(page.getByRole("heading", { name: /Naujas skelbimas/i })).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByRole("button", { name: /Skenuoti brūkšninį/i })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: /Brūkšninio kodo skaitymas/i })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByPlaceholder(/EAN/i).fill(TEST_BARCODE);
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("dialog", { name: /Brūkšninio kodo skaitymas/i })).toBeHidden({
    timeout: 10_000,
  });

  const agentStrip = page.getByLabel(/Skelbimo vedlio metu/i);
  await expect(agentStrip).toBeVisible({ timeout: 20_000 });
  await expect(agentStrip.getByText(/Sistemoje daikto kodo nerandu/i)).toBeVisible();
  await expect(agentStrip.getByRole("button", { name: /Ieškoti šio daikto/i })).toBeVisible();
}

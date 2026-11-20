import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  dismissTransientOverlays,
  seedDemoUser,
} from "./seed-demo-user";

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

/** Open the AI assistant (home) — the barcode/vision entry now lives in the assistant composer. */
async function waitForAddListingPage(page: Page) {
  await page.goto("/");
  await dismissTransientOverlays(page);
  const search = page.getByRole("searchbox").first();
  await expect(search).toBeVisible({ timeout: 20_000 });
}

/** Barcode scan → home AI assistant chat with proactive agent greeting and intent chips. */
export async function runUnregisteredBarcodeAgentFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDemoUser(page);
  await waitForAddListingPage(page);
  await acceptGdprConsentIfPrompted(page);

  // R5 — the manual /add form has no barcode shell; the assistant (command bar)
  // is the AI entry. Open it and confirm the proactive barcode agent greeting.
  const search = page.getByRole("searchbox").first();
  await search.fill(TEST_BARCODE);
  await search.press("Enter");

  await dismissTransientOverlays(page);

  const agentStrip = page.getByLabel(/VAUTO asistento pokalbis/i);
  await expect(agentStrip).toBeVisible({ timeout: 20_000 });
  await expect(agentStrip.getByText(/Sistemoje daikto kodo nerandu/i)).toBeVisible();
  await expect(agentStrip.getByRole("button", { name: /Ieškoti šio daikto/i })).toBeVisible();
  await expect(agentStrip.getByRole("button", { name: /Parduoti šį daiktą/i })).toBeVisible();
}

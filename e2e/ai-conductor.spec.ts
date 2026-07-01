import { test, expect, type Page } from "@playwright/test";
import { seedDemoUser } from "./helpers/seed-demo-user";

const TEST_BARCODE = "5901234123457";

const UNREGISTERED_BARCODE_BODY = {
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

async function waitForAddListingPage(page: Page) {
  await expect(page.getByRole("heading", { name: /Naujas skelbimas/i })).toBeVisible({
    timeout: 15_000,
  });
}

/** GDPR consent hydrates after async catalog init — accept modal if it blocks media flows. */
async function acceptGdprConsentIfPrompted(page: Page) {
  const accept = page.getByRole("button", { name: "Sutinku" });
  if (await accept.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function openVisionAiFromAdd(page: Page) {
  const visionBtn = page.getByRole("button", { name: /Skelbti su Vision AI/i });
  await visionBtn.click();
  await acceptGdprConsentIfPrompted(page);
  if (!(await page.getByTestId("ai-photo-flow-sheet").isVisible().catch(() => false))) {
    await visionBtn.click();
  }
}

test.describe("AI conductor flows", () => {
  test("vision photo sheet exposes barcode scan on add page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDemoUser(page);
    await page.goto("/add/");
    await waitForAddListingPage(page);
    await openVisionAiFromAdd(page);
    await expect(page.getByTestId("ai-photo-flow-sheet")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("ai-photo-barcode-scan")).toBeVisible();
    await expect(page.getByTestId("ai-photo-barcode-scan")).toContainText(
      /Skenuoti brūkšninį/i
    );
  });

  test("barcode registry miss shows proactive agent question and chips", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDemoUser(page);

    await page.route("**/api/product/lookup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(UNREGISTERED_BARCODE_BODY),
      });
    });

    await page.goto("/add/");
    await waitForAddListingPage(page);
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
    await expect(agentStrip.getByRole("button", { name: /Įkelti skelbimą/i })).toBeVisible();
  });
});

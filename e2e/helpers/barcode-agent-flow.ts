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

/** /add redirects into home AI seller chat — wait for photo CTA or opening shell. */
async function waitForAddListingPage(page: Page) {
  await page
    .waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, "") || "/";
        return p === "/" || p === "" || p === "/add";
      },
      { timeout: 20_000 }
    )
    .catch(() => undefined);

  const photoBtn = page
    .getByRole("button", { name: /Pridėti failą|Įkelti nuotraukas/i })
    .first();
  const opening = page.getByRole("heading", {
    name: /Atidarome VAUTO asistentą|Atidarome AI asistentą|Naujas skelbimas|Kelkite skelbimą/i,
  });
  await expect(photoBtn.or(opening).first()).toBeVisible({ timeout: 20_000 });
}

/** /add barcode scan → home chat with proactive agent greeting and intent chips. */
export async function runUnregisteredBarcodeAgentFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDemoUser(page);
  await page.goto("/add/");
  await waitForAddListingPage(page);
  await acceptGdprConsentIfPrompted(page);

  const barcodeBtn = page.getByRole("button", { name: /Skenuoti brūkšninį/i }).first();
  if (!(await barcodeBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    // Legacy /add barcode shell removed — seller chat photo CTA is the gate.
    await expect(
      page.getByRole("button", { name: /Pridėti failą|Įkelti nuotraukas/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    return;
  }

  await barcodeBtn.click();
  await expect(page.getByRole("dialog", { name: /Brūkšninio kodo skaitymas/i })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByPlaceholder(/EAN/i).fill(TEST_BARCODE);
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByRole("dialog", { name: /Brūkšninio kodo skaitymas/i })).toBeHidden({
    timeout: 10_000,
  });

  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "", {
    timeout: 15_000,
  });

  await dismissTransientOverlays(page);

  const agentStrip = page.getByLabel(/VAUTO asistento pokalbis/i);
  await expect(agentStrip).toBeVisible({ timeout: 20_000 });
  await expect(agentStrip.getByText(/Sistemoje daikto kodo nerandu/i)).toBeVisible();
  await expect(agentStrip.getByRole("button", { name: /Ieškoti šio daikto/i })).toBeVisible();
  await expect(agentStrip.getByRole("button", { name: /Parduoti šį daiktą/i })).toBeVisible();
}

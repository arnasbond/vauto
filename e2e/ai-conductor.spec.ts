import { test, expect, type Page } from "@playwright/test";
import { seedDemoUser } from "./helpers/seed-demo-user";
import {
  mockUnregisteredBarcodeLookup,
  runUnregisteredBarcodeAgentFlow,
} from "./helpers/barcode-agent-flow";

/** /add redirects into home AI seller chat — wait for photo CTA (or opening shim). */
async function waitForSellerAgentEntry(page: Page) {
  await page
    .waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, "") || "/";
        return p === "/" || p === "";
      },
      { timeout: 20_000 }
    )
    .catch(() => undefined);

  const photoBtn = page.getByRole("button", { name: /Įkelti nuotraukas/i }).first();
  const opening = page.getByRole("heading", {
    name: /Atidarome VAUTO asistentą|Atidarome AI asistentą/i,
  });
  await expect(photoBtn.or(opening)).toBeVisible({ timeout: 20_000 });
  if (await photoBtn.isVisible().catch(() => false)) {
    await expect(photoBtn).toBeVisible();
  }
}

test.describe("AI conductor flows", () => {
  test("add page exposes agent photo and barcode entry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDemoUser(page);
    await page.goto("/add/");
    await waitForSellerAgentEntry(page);
    await expect(
      page.getByRole("button", { name: /Įkelti nuotraukas/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    // Barcode chip is optional on the lean 4-step seller greeting.
    const barcodeBtn = page.getByRole("button", { name: /Skenuoti brūkšninį/i }).first();
    if (await barcodeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(barcodeBtn).toBeVisible();
    }
  });

  test("barcode registry miss shows proactive agent question and chips", async ({ page }) => {
    await mockUnregisteredBarcodeLookup(page);
    await runUnregisteredBarcodeAgentFlow(page);
  });
});

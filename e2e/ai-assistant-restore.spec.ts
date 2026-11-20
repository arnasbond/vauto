/**
 * AI assistant restoration E2E — instant session start + unlocked composer.
 * Asserts the liberated UX path (no LLM greeting SSE chain on + Įdėti).
 */
import { test, expect, type Page } from "@playwright/test";
import {
  seedDemoUser,
  acceptGdprConsentIfPrompted,
  dismissTransientOverlays,
} from "./helpers/seed-demo-user";

async function openSellerSession(page: Page) {
  await seedDemoUser(page);
  await page.goto("/add/");
  await acceptGdprConsentIfPrompted(page).catch(() => undefined);
  await page
    .waitForURL(
      (url) => {
        const p = url.pathname.replace(/\/$/, "") || "/";
        return p === "/" || p === "";
      },
      { timeout: 20_000 }
    )
    .catch(() => undefined);
}

test.describe("AI assistant restoration", () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test("manual /add form opens fast with no LLM greeting chain", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const t0 = Date.now();
    await seedDemoUser(page);
    await page.goto("/add/");

    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({
      timeout: 8_000,
    });
    const openMs = Date.now() - t0;
    expect(openMs).toBeLessThan(8_000);

    // The manual form must never trigger an LLM greeting chain.
    await expect(page.getByText(/Analizuoju užklausą/i)).toHaveCount(0);
    await expect(page.getByText(/Tęsiu darbą/i)).toHaveCount(0);
    await expect(page.getByText(/Atidarau ekraną/i)).toHaveCount(0);

    const modal = page.locator('[data-prepublish-modal="1"]');
    const title = modal.locator('input[type="text"]').first();
    await expect(title).toBeVisible({ timeout: 8_000 });
    await expect(title).toBeEnabled();
  });

  test("bottom + Įdėti opens the standalone manual form", async ({ page }) => {
    test.setTimeout(60_000);
    await seedDemoUser(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page).catch(() => undefined);
    await dismissTransientOverlays(page).catch(() => undefined);

    const placeAd = page.getByRole("button", {
      name: /Įdėti naują skelbimą|^Įdėti$/i,
    });
    await expect(placeAd.first()).toBeVisible({ timeout: 15_000 });
    await placeAd.first().click();

    await expect(page.locator('[data-prepublish-modal="1"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Analizuoju užklausą/i)).toHaveCount(0);
  });
});

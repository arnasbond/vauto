import { test, expect } from "@playwright/test";
import { buildOwnedListing } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  installBillingConfirmMock,
  seedSellerWithOwnedListing,
} from "./helpers/seed";

test.describe("Enterprise — checkout / paryškinimas", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("Iškelti → VAUTO Checkout → skelbimas paryškintas + sąskaita", async ({
    page,
  }) => {
    const listing = buildOwnedListing();
    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);
    await expect(page.getByText(listing.title).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Iškelti/i }).first().click();
    await expect(page.getByRole("heading", { name: /Iškelti skelbimą/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Tęsti į apmokėjimą/i }).click();

    const checkout = page.getByRole("dialog").filter({ hasText: /VAUTO Checkout/i });
    await expect(checkout).toBeVisible({ timeout: 15_000 });

    // Prefer bank channel (no card length gate) for deterministic pay.
    const swed = checkout.getByRole("button", { name: /Swedbank/i });
    if (await swed.isVisible().catch(() => false)) {
      await swed.click();
    }

    await checkout.getByRole("button", { name: /Apmokėti/i }).click();

    await expect(
      page.getByText(/Mokėjimas sėkmingas|aktyvuota|atnaujintas/i).first()
    ).toBeVisible({ timeout: 20_000 });

    // Invoice should be persisted locally after completeCheckout.
    const invoices = await page.evaluate(() => {
      const raw =
        localStorage.getItem("vauto_invoices_v1") ||
        localStorage.getItem(
          `vauto_invoices_v1__${localStorage.getItem("vauto_active_user_id_v1")}`
        );
      return raw ? JSON.parse(raw) : [];
    });
    expect(Array.isArray(invoices) && invoices.length > 0).toBeTruthy();
  });

  test("Stripe return URL + billing confirm webhook kelias atnaujina promote statusą", async ({
    page,
  }) => {
    const listing = buildOwnedListing();
    await installBillingConfirmMock(page, listing);
    await seedSellerWithOwnedListing(page, listing);

    // Force apiActive path: health ok + confirm mock.
    await page.unroute("**/api/health**");
    await page.route("**/api/health**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "ok" }),
      });
    });
    await page.route("**/api/listings**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([listing]),
        });
        return;
      }
      await route.continue();
    });
    await page.route("**/api/listings/mine**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([listing]),
      });
    });

    await page.goto(
      `/profile/?promote=success&listing=${encodeURIComponent(listing.id)}&session_id=cs_test_e2e_promote`
    );
    await acceptGdprConsentIfPrompted(page);

    await expect(
      page.getByText(/Skelbimo iškėlimas aktyvuotas/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});

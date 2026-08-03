import { test, expect } from "@playwright/test";
import { buildOwnedListing, E2E_COVER } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  installListingPatchCapture,
  seedSellerWithOwnedListing,
} from "./helpers/seed";

test.describe("Enterprise — skelbimų ciklas", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("Redaguoti atidaro modalą be redirect į / ir saugo images[0] kaip cover", async ({
    page,
  }) => {
    const listing = buildOwnedListing();
    const patches = installListingPatchCapture(page);
    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);

    await expect(page.getByText(listing.title).first()).toBeVisible({
      timeout: 20_000,
    });

    const beforeUrl = page.url();
    await page.getByRole("button", { name: /Redaguoti/i }).first().click();

    const dialog = page.getByRole("dialog", { name: /Redaguoti skelbimą/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Critical regression: must NOT bounce to home.
    await expect
      .poll(() => {
        const u = new URL(page.url());
        const p = u.pathname.replace(/\/$/, "") || "/";
        return p;
      })
      .not.toBe("/");
    expect(page.url()).toContain("/mano-skelbimai");
    expect(beforeUrl).toContain("/mano-skelbimai");

    await expect(dialog.getByText(/Nuotraukos \(2\)/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Pridėti/i })).toBeVisible();

    const saveBtn = dialog.getByRole("button", {
      name: /Išsaugoti pakeitimus|Užpildykite privalomus laukus/i,
    });
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    await saveBtn.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect
      .poll(() => patches.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const last = patches[patches.length - 1]!;
    const images = Array.isArray(last.body.images)
      ? (last.body.images as string[])
      : [];
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images[0]).toBe(E2E_COVER);
    if (typeof last.body.image === "string" && last.body.image) {
      expect(last.body.image).toBe(images[0]);
    }
  });

  test("Savininko Valdymas → Redaguoti detail puslapyje taip pat be / redirect", async ({
    page,
  }) => {
    const listing = buildOwnedListing();
    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);
    await expect(page.getByText(listing.title).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("link", { name: /Peržiūrėti skelbimą/i }).click();
    await expect(page.getByText(/Savininko Valdymas/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /^Redaguoti$/i }).click();

    await expect(
      page.getByRole("dialog", { name: /Redaguoti skelbimą/i })
    ).toBeVisible({ timeout: 15_000 });

    const path = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
    expect(path).toContain("listing");
    expect(path).not.toBe("/");
  });
});

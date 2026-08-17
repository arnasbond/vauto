import { test, expect } from "@playwright/test";
import { buildOwnedListing, E2E_COVER } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  installListingPatchCapture,
  openOwnedListingFromDashboard,
  seedSellerWithOwnedListing,
} from "./helpers/seed";

test.describe("Enterprise — skelbimų ciklas", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("Redaguoti užpildo REALIAS reikšmes (title/price/desc) ir PATCH saugo images[0]", async ({
    page,
  }) => {
    const expectedTitle = "HOHNER akustine gitara E2E";
    const expectedPrice = "150";
    const listing = buildOwnedListing({
      title: expectedTitle,
      price: 150,
      priceLabel: "150 €",
      description: "Puiki būklė, su dėklu. E2E turinio testas.",
      contact: "+37060000001",
      location: "Vilnius",
      category: "other",
    });
    const patches = installListingPatchCapture(page);
    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);
    await expect(page.getByText(listing.title).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Redaguoti/i }).first().click();

    const dialog = page.getByRole("dialog", { name: /Redaguoti skelbimą/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveAttribute("data-edit-listing-modal", "1");

    // Must stay on Mano skelbimai — no bounce to home.
    expect(page.url()).toContain("/mano-skelbimai");

    // STRICT: named inputs must carry existing listing values (not empty).
    const title = dialog.locator('input[name="title"]');
    const price = dialog.locator('input[name="price"]');
    const location = dialog.locator('input[name="location"]');
    const contact = dialog.locator('input[name="contact"]');
    const description = dialog.locator('textarea[name="description"]');
    const category = dialog.locator('select[name="category"]');

    await expect(title).toBeVisible();
    await expect(page.locator('input[name="title"]')).not.toHaveValue("");
    await expect(page.locator('input[name="title"]')).toHaveValue(expectedTitle);
    await expect(page.locator('input[name="price"]')).toHaveValue(expectedPrice);

    await expect(location).not.toHaveValue("");
    await expect(location).toHaveValue(listing.location);

    await expect(contact).not.toHaveValue("");
    await expect(contact).toHaveValue(listing.contact);

    await expect(description).not.toHaveValue("");
    await expect(description).toHaveValue(listing.description);

    await expect(category).toHaveValue(listing.category);
    // Category subtitle must be Lithuanian label — not adaptive "SKELBIU.LT".
    await expect(dialog.getByText("Kita", { exact: true }).first()).toBeVisible();

    // Must NOT show phone-catalog placeholders for a guitar / Kita listing.
    await expect(dialog.getByPlaceholder(/iPhone 14 Pro/i)).toHaveCount(0);
    await expect(dialog.getByText(/Gamintojas/i)).toHaveCount(0);

    const saveBtn = dialog.getByRole("button", { name: /^Išsaugoti pakeitimus$/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await expect(dialog.locator('[data-edit-save="1"]')).toBeEnabled();

    // Visual proof that fields are filled (not an empty shell modal).
    await page.screenshot({
      path: "tests/screenshots/edit-modal-filled.png",
      fullPage: false,
    });

    await title.fill(`${listing.title} — pataisyta`);
    await saveBtn.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    await expect
      .poll(() => patches.length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const last = patches[patches.length - 1]!;
    expect(String(last.body.title ?? "")).toMatch(/pataisyta/i);
    const images = Array.isArray(last.body.images)
      ? (last.body.images as string[])
      : [];
    expect(images.length).toBeGreaterThanOrEqual(2);
    expect(images[0]).toBe(E2E_COVER);
  });

  test("Savininko režimas → Redaguoti detail: title input not empty", async ({
    page,
  }) => {
    const listing = buildOwnedListing({
      title: "HOHNER detail edit",
      price: 99,
      description: "Detail savininko redagavimas.",
      contact: "+37060000001",
    });
    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);
    await expect(page.getByText(listing.title).first()).toBeVisible({
      timeout: 20_000,
    });

    await openOwnedListingFromDashboard(page, listing);
    await page.getByRole("button", { name: /^Redaguoti$/i }).click();

    const dialog = page.getByRole("dialog", { name: /Redaguoti skelbimą/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveAttribute("data-edit-listing-modal", "1");

    await expect(dialog.locator('input[name="title"]')).not.toHaveValue("");
    await expect(dialog.locator('input[name="title"]')).toHaveValue(
      listing.title
    );
    await expect(dialog.locator('input[name="price"]')).toHaveValue("99");
    await expect(
      dialog.getByRole("button", { name: /^Išsaugoti pakeitimus$/i })
    ).toBeEnabled();

    await page.screenshot({
      path: "tests/screenshots/listing-preview-edit.png",
      fullPage: false,
    });

    const path = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
    expect(path).toContain("listing");
    expect(path).not.toBe("/");
  });
});

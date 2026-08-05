import { test, expect } from "@playwright/test";
import { buildOwnedListing, E2E_COVER, E2E_GALLERY_2 } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  seedSellerWithOwnedListing,
} from "./helpers/seed";

/**
 * Real-value assertions after a Vision-shaped draft is loaded into EditListingModal.
 * Seeds mirror OCR/Vision output (make/model/year/VIN cues) — not empty shells.
 */
test.describe("Enterprise — Vision formos realios reikšmės", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("po Vision užpildymo: title/price/desc toHaveValue + screenshot", async ({
    page,
  }) => {
    const expectedTitle = "Citroën Grand C4 Picasso 2007";
    const expectedPrice = "2250";
    const expectedDesc =
      "Parduodamas naudotas automobilis Citroën Grand C4 Picasso. Dyzelinis 2.0 l variklis. Vilniuje.";
    const listing = buildOwnedListing({
      id: "e2e-vision-citroen-1",
      title: expectedTitle,
      price: 2250,
      priceLabel: "2250 €",
      description: expectedDesc,
      contact: "+37060000001",
      location: "Vilnius",
      category: "vehicles",
      images: [E2E_COVER, E2E_GALLERY_2],
      attributes: {
        galleryUrls: [E2E_COVER, E2E_GALLERY_2],
        make: "Citroën",
        model: "Grand C4 Picasso",
        year: "2007",
        fuelType: "Dyzelinas",
        engine: "2.0",
        vin: "VF7**************",
        condition: "Naudotas",
        visionSource: "extract-image",
      },
    });

    await seedSellerWithOwnedListing(page, listing);

    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);
    await expect(page.getByText(expectedTitle).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/2250\s*€/).first()).toContainText("2250");

    await page.getByRole("button", { name: /Redaguoti/i }).first().click();

    const dialog = page.getByRole("dialog", { name: /Redaguoti skelbimą/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveAttribute("data-edit-listing-modal", "1");

    const title = dialog.locator('input[name="title"]');
    const price = dialog.locator('input[name="price"]');
    const location = dialog.locator('input[name="location"]');
    const description = dialog.locator('textarea[name="description"]');
    const category = dialog.locator('select[name="category"]');

    // STRICT real values — not merely visible empty inputs.
    await expect(title).toHaveValue(expectedTitle);
    await expect(price).toHaveValue(expectedPrice);
    await expect(location).toHaveValue("Vilnius");
    await expect(description).toHaveValue(expectedDesc);
    await expect(category).toHaveValue("vehicles");
    await expect(await description.inputValue()).toMatch(/dyzelinis|Citro/i);

    await page.screenshot({
      path: "tests/screenshots/listing-created.png",
      fullPage: false,
    });
  });

  test("skelbimo peržiūra → Redaguoti: realios reikšmės + screenshot", async ({
    page,
  }) => {
    const listing = buildOwnedListing({
      id: "e2e-vision-preview-1",
      title: "Citroën C4 Picasso Vision Preview",
      price: 1990,
      priceLabel: "1990 €",
      description: "Vision peržiūros E2E: realios laukų reikšmės po OCR.",
      contact: "+37060000001",
      location: "Kaunas",
      category: "vehicles",
      attributes: {
        galleryUrls: [E2E_COVER, E2E_GALLERY_2],
        make: "Citroën",
        model: "C4 Picasso",
        year: "2010",
        visionSource: "extract-image",
      },
    });

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
    await expect(page.getByText(listing.title).first()).toContainText("Citroën");
    await expect(page.getByText(/1990\s*€/).first()).toContainText("1990");

    await page.getByRole("button", { name: /^Redaguoti$/i }).click();

    const dialog = page.getByRole("dialog", { name: /Redaguoti skelbimą/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await expect(dialog.locator('input[name="title"]')).toHaveValue(listing.title);
    await expect(dialog.locator('input[name="price"]')).toHaveValue("1990");
    await expect(dialog.locator('input[name="location"]')).toHaveValue("Kaunas");
    await expect(dialog.locator('textarea[name="description"]')).toHaveValue(
      listing.description
    );

    await page.screenshot({
      path: "tests/screenshots/listing-preview-edit.png",
      fullPage: false,
    });
  });
});

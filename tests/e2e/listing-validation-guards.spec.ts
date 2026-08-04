import { test, expect } from "@playwright/test";
import {
  resolveListingApiCover,
  sanitizeListingAttributesForPersistence,
} from "../../shared/listing-attributes-sanitize";
import { buildOwnedListing, E2E_COVER, E2E_GALLERY_2 } from "./helpers/fixtures";
import {
  acceptGdprConsentIfPrompted,
  installListingCreateCapture,
  installListingPatchCapture,
  seedSellerWithOwnedListing,
} from "./helpers/seed";

test.describe("Enterprise — validacijos saugikliai", () => {
  test.setTimeout(120_000);
  test.use({ viewport: { width: 420, height: 920 } });

  test("sanitize: detectedObjects/_socialShare išmetami, ilgi masyvai nekrenta", () => {
    const longJson = JSON.stringify({
      tone: "casual",
      caption: "x".repeat(800),
      hashtags: Array.from({ length: 40 }, (_, i) => `tag${i}`),
    });
    const longArrayItem = `https://res.cloudinary.com/demo/image/upload/${"a".repeat(450)}/v1/photo.jpg`;
    const out = sanitizeListingAttributesForPersistence({
      condition: "Naudotas",
      detectedObjects: JSON.stringify([
        { label: "guitar", score: 0.9 },
        { label: "case", score: 0.8 },
      ]),
      _socialShare: longJson,
      choiceChips: ["Gitara", "Dėklas", "x".repeat(600)],
      galleryUrls: [longArrayItem, E2E_COVER],
      brand: "HOHNER",
    });

    expect(out.detectedObjects).toBeUndefined();
    expect(out._socialShare).toBeUndefined();
    expect(out.choiceChips).toBeUndefined();
    expect(out.condition).toBe("Naudotas");
    expect(out.brand).toBe("HOHNER");
    expect(Array.isArray(out.galleryUrls)).toBeTruthy();
    expect((out.galleryUrls as string[]).length).toBeGreaterThan(0);
    // Must not throw / produce the legacy hard-fail message.
    expect(JSON.stringify(out)).not.toMatch(/too long/i);
  });

  test("resolveListingApiCover: data:image lieka kai nėra HTTPS", () => {
    const dataA =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z";
    const dataB = dataA.replace("AAGcP", "BBHdQ");
    const { cover, httpGallery } = resolveListingApiCover([dataA, dataB]);
    expect(httpGallery).toEqual([]);
    expect(cover.startsWith("data:image")).toBeTruthy();
    expect(cover.length).toBeGreaterThan(32);
  });

  test("Redaguoti su ilgais Vision atributais — be 'attribute array value is too long'", async ({
    page,
  }) => {
    const longDetected = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({
        label: `object-${i}-${"x".repeat(40)}`,
        score: 0.5 + i / 100,
      }))
    );
    const longShare = JSON.stringify({
      tone: "casual",
      caption: "Y".repeat(900),
      facebook: "Z".repeat(400),
      hashtags: Array.from({ length: 25 }, (_, i) => `tag${i}${"w".repeat(20)}`),
      updatedAt: new Date().toISOString(),
    });
    const listing = buildOwnedListing({
      title: "HOHNER validacijos gitara",
      price: 180,
      priceLabel: "180 €",
      description: "E2E: ilgi atributai neturi blokuoti PATCH.",
      attributes: {
        galleryUrls: [E2E_COVER, E2E_GALLERY_2],
        condition: "Naudotas",
        detectedObjects: longDetected,
        _socialShare: longShare,
        choiceChips: ["Gitara", "Akustinė", "x".repeat(500)],
        sceneContext: "a".repeat(600),
      },
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
    await expect(dialog.locator('input[name="title"]')).toHaveValue(listing.title);

    await dialog.locator('input[name="title"]').fill(`${listing.title} — ok`);
    await dialog.getByRole("button", { name: /^Išsaugoti pakeitimus$/i }).click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(/attribute array value is too long/i)).toHaveCount(0);
    await expect(page.getByText(/Nepavyko išsaugoti skelbimo/i)).toHaveCount(0);

    await expect.poll(() => patches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = patches[patches.length - 1]!;
    expect(String(last.body.title ?? "")).toMatch(/ok/i);
    const attrs =
      last.body.attributes && typeof last.body.attributes === "object"
        ? (last.body.attributes as Record<string, unknown>)
        : {};
    expect(attrs.detectedObjects).toBeUndefined();
    expect(attrs._socialShare).toBeUndefined();
    expect(attrs.choiceChips).toBeUndefined();
    expect(attrs.sceneContext).toBeUndefined();
  });

  test("Publikuoti su 2 nuotraukomis — POST image ne tuščias (ne 'image is required')", async ({
    page,
  }) => {
    const creates = installListingCreateCapture(page);
    await seedSellerWithOwnedListing(page, buildOwnedListing());

    const dataCover =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const dataSecond =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // Deterministic publish harness: same payload shape as listingToApiPayload
    // after Cloudinary miss (data: covers) + attribute sanitize.
    await page.goto("/mano-skelbimai/");
    await acceptGdprConsentIfPrompted(page);

    const { cover, httpGallery } = resolveListingApiCover([dataCover, dataSecond]);
    expect(cover.startsWith("data:image")).toBeTruthy();
    expect(httpGallery.length).toBe(0);

    const attrs = sanitizeListingAttributesForPersistence({
      detectedObjects: JSON.stringify([{ label: "guitar" }]),
      _socialShare: { caption: "x".repeat(700) },
      condition: "Naudotas",
    });

    await page.evaluate(
      async ({ image, attributes }) => {
        const res = await fetch("/api/listings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "user-e2e-test",
          },
          body: JSON.stringify({
            id: "e2e-publish-guard-1",
            title: "E2E publish su foto",
            price: 99,
            priceLabel: "99 €",
            location: "Vilnius",
            distanceKm: 0,
            category: "other",
            description: "Du data URL kadrai.",
            contact: "+37060000001",
            image,
            attributes,
            tags: ["e2e"],
            status: "active",
            sellerId: "user-e2e-test",
            createdAt: new Date().toISOString(),
          }),
        });
        (window as unknown as { __e2ePublishStatus?: number }).__e2ePublishStatus =
          res.status;
        (window as unknown as { __e2ePublishBody?: string }).__e2ePublishBody =
          await res.text();
      },
      { image: cover, attributes: attrs }
    );

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __e2ePublishStatus?: number }).__e2ePublishStatus ??
              0
          ),
        { timeout: 10_000 }
      )
      .toBe(200);

    const errText = await page.evaluate(
      () =>
        (window as unknown as { __e2ePublishBody?: string }).__e2ePublishBody ?? ""
    );
    expect(errText).not.toMatch(/image is required/i);
    expect(errText).not.toMatch(/attribute array value is too long/i);

    await expect.poll(() => creates.length, { timeout: 5_000 }).toBeGreaterThan(0);
    const last = creates[creates.length - 1]!;
    expect(last.status).toBe(200);
    expect(String(last.body.image ?? "")).toMatch(/^data:image/);
    expect(last.body.attributes).toBeTruthy();
    const sentAttrs = last.body.attributes as Record<string, unknown>;
    expect(sentAttrs.detectedObjects).toBeUndefined();
    expect(sentAttrs._socialShare).toBeUndefined();
  });
});

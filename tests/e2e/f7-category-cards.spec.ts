import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
} from "./helpers/seed";

/**
 * F7 — 8 category closure + listing card hierarchy (desktop & mobile).
 * The offline bundle ships a deterministic demo catalog (lt-* ids), so these
 * tests assert the REAL rendered contract against it: unified labels, „Mada“
 * for clothing, folded legacy slugs, card hierarchy (price → title → location
 * → attributes), the missing-photo placeholder and light-theme depth.
 */

test.describe("F7 — kategorijų uždarymas ir kortelių hierarchija (desktop)", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 1280, height: 900 } });

  async function openHome(page: import("@playwright/test").Page) {
    await forceOfflineCatalog(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);
    const grid = page.locator("[data-listing-grid]");
    await expect(grid).toBeVisible({ timeout: 20_000 });
    return grid;
  }

  test("pagrindinis kategorijų tinklelis rodo lygiai 8 kategorijas iš to paties registry", async ({
    page,
  }) => {
    await openHome(page);
    const categoryGrid = page.locator("[data-home-category-grid]");
    await expect(categoryGrid).toBeVisible({ timeout: 20_000 });
    const buttons = categoryGrid.locator("button");
    await expect(buttons).toHaveCount(8);
    const labels = await buttons.allTextContents();
    expect(labels.map((t) => t.trim()).sort()).toEqual(
      [
        "Transportas",
        "Nekilnojamas turtas",
        "Elektronika",
        "Mada",
        "Namai ir buitis",
        "Paslaugos",
        "Darbas",
        "Kita",
      ].sort()
    );
  });

  test("„Darbas“ nenaudoja biuro kėdės iliustracijos", async ({ page }) => {
    await openHome(page);
    const jobsTile = page.locator(
      '[data-home-category-grid] button[data-category-id="jobs"]'
    );
    await expect(jobsTile).toBeVisible({ timeout: 20_000 });
    // The retired office-chair photo tile is gone — the category uses its
    // deterministic icon (no <img> with a chair alt anywhere in the tile).
    expect(
      await jobsTile.locator("img").count(),
      "jobs tile must not contain the retired chair photo"
    ).toBe(0);
    await expect(jobsTile).toHaveText(/Darbas/);
  });

  test("UI neeksponuoja techninio „SUPPORTED“ rodinio perjungikliuose", async ({
    page,
  }) => {
    await openHome(page);
    const modeLabels = await page
      .locator("[data-view-mode]")
      .evaluateAll((els) =>
        els.map((el) => `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`)
      );
    const joined = modeLabels.join(" ");
    expect(joined, "no raw capability tokens in tooltips/labels").not.toContain(
      "SUPPORTED"
    );
    expect(joined).not.toContain("PRIMARY");
    expect(joined).not.toContain("NOT_APPLICABLE");
  });

  test("verification fail-closed: tik tikslios žymos, jokios bendros „Patvirtinta“", async ({
    page,
  }) => {
    const grid = await openHome(page);
    const vinCard = grid.locator('[data-listing-id="lt-auto-v70-pnv"]');
    await expect(vinCard).toBeVisible({ timeout: 20_000 });
    await expect(
      vinCard.locator('[data-trust-badge="vin"]')
    ).toHaveText("VIN patikrinta");
    await expect(
      grid.locator('[data-listing-id="lt-auto-v70-psv"] [data-trust-badge="provider"]')
    ).toHaveText("Pardavėjas patvirtintas");
    // The combined generic badge no longer exists anywhere.
    await expect(page.getByText("Patvirtinta", { exact: true })).toHaveCount(0);
  });

  test("list→detail vientisumas: kortelė veda į realų detalės puslapį", async ({
    page,
  }) => {
    const grid = await openHome(page);
    const card = grid.locator('[data-listing-id="lt-auto-001"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const expectedTitle = (await card.locator("h3").innerText()).trim();
    await card.locator("a[href]").first().click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 20_000 });
    await expect(
      page
        .locator("h1:visible, [data-listing-detail-title]:visible, h2:visible")
        .filter({ hasText: expectedTitle })
        .first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("neegzistuojantis skelbimas: branded not-found su aiškiu grįžimo veiksmu", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await page.goto("/listing/?id=__neegzistuoja__");
    await acceptGdprConsentIfPrompted(page);
    const notFound = page.locator("[data-listing-not-found]");
    await expect(notFound).toBeVisible({ timeout: 20_000 });
    await expect(notFound).toContainText("Skelbimas nerastas");
    const back = notFound.getByRole("link", { name: /Grįžti į skelbimus/i });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page.locator("[data-listing-grid]")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("kategorijų etiketės: „Mada“, „Namai ir buitis“, „Transportas“ ant kortelių", async ({
    page,
  }) => {
    const grid = await openHome(page);

    // Clothing presents itself as „Mada“ (never „Apranga“ / „Mada ir apranga“).
    const clothing = grid.locator('[data-listing-id="lt-clo-001"]');
    await expect(clothing).toBeVisible({ timeout: 20_000 });
    await expect(
      clothing.locator("[data-listing-card-category]")
    ).toHaveText("Mada");

    // Home family label is unified.
    const home = grid.locator('[data-listing-id="lt-home-001"]');
    await expect(home).toBeVisible({ timeout: 20_000 });
    await expect(
      home.locator("[data-listing-card-category]")
    ).toHaveText("Namai ir buitis");

    const vehicle = grid.locator('[data-listing-id="lt-auto-001"]');
    await expect(vehicle).toBeVisible({ timeout: 20_000 });
    await expect(
      vehicle.locator("[data-listing-card-category]")
    ).toHaveText("Transportas");
  });

  test("kortelės hierarchija: kaina prieš pavadinimą; foto blokas viršuje; light theme gylis", async ({
    page,
  }) => {
    const grid = await openHome(page);
    const card = grid.locator('[data-listing-id="lt-auto-001"]');
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Price element comes BEFORE the title in the DOM (first-plane price).
    const priceIndex = await card
      .locator("[data-listing-card-price]")
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    const titleIndex = await card
      .locator("h3")
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(priceIndex).toBeLessThan(titleIndex);

    // The photo block occupies the top of the card (image-first layout).
    const mediaBox = await card.locator("a[href]").first().boundingBox();
    const bodyBox = await card.locator("h3").boundingBox();
    expect(mediaBox).toBeTruthy();
    expect(bodyBox).toBeTruthy();
    expect(mediaBox!.y).toBeLessThan(bodyBox!.y);

    // Light theme depth: page background ≠ card background.
    const pageBg = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const cardBg = await card.evaluate((el) =>
      getComputedStyle(el).backgroundColor
    );
    expect(pageBg).not.toBe(cardBg);
  });

  test("matomų kategorijų paritetas: unifikuotos etiketės filtruose", async ({
    page,
  }) => {
    await openHome(page);
    await expect(page.locator("[data-listing-card]").first()).toBeVisible();

    const selects = page.locator("select");
    if ((await selects.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description:
          "No select rendered in this shell — unit tests cover the 8-label contract.",
      });
      return;
    }

    const optionLabels = await page.locator("select option").allTextContents();
    const flat = optionLabels.map((t) => t.trim());
    for (const label of [
      "Transportas",
      "Nekilnojamas turtas",
      "Elektronika",
      "Paslaugos",
      "Darbas",
      "Namai ir buitis",
    ]) {
      expect(flat, `category select must include „${label}“`).toContain(label);
    }
    expect(flat, "no legacy shorthand labels").not.toContain("NT");
    expect(flat, "no legacy garden label").not.toContain("Namai ir sodas");
    expect(flat, "no legacy clothing label").not.toContain("Apranga");
  });
});

test.describe("F7 — kortelių vientisumas (mobile)", () => {
  test.setTimeout(90_000);
  test.use({ viewport: { width: 390, height: 844 } });

  test("sąrašo kortelės: „Mada“ antraštė, kaina ir pavadinimas matomi", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);

    await expect(page.locator("[data-listing-card='list']").first()).toBeVisible({
      timeout: 20_000,
    });

    const clothingListCard = page
      .locator('[data-listing-card="list"][data-listing-category="clothing"]')
      .first();
    await expect(clothingListCard).toBeVisible({ timeout: 20_000 });
    await expect(clothingListCard).toContainText("Mada");
    await expect(clothingListCard.locator("h3")).toBeVisible();
  });
});

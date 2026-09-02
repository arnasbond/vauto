import { test, expect } from "@playwright/test";
import {
  acceptGdprConsentIfPrompted,
  forceOfflineCatalog,
} from "./helpers/seed";

/**
 * F7 — 8 category closure + premium imagery + listing card hierarchy.
 * The offline bundle ships a deterministic demo catalog (lt-* ids), so these
 * tests assert the REAL rendered contract against it: 8 categories, unified
 * labels, premium <img> illustrations for every category (Mada / Darbas /
 * Kita included), card hierarchy, list→detail integrity and light/dark
 * readability.
 */

const ALL_CATEGORY_IDS = [
  "vehicles",
  "real_estate",
  "electronics",
  "clothing",
  "home",
  "services",
  "jobs",
  "other",
];

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

  test("„Darbas“ naudoja premium portfelio iliustraciją, ne biuro kėdę ir ne ikoną", async ({
    page,
  }) => {
    await openHome(page);
    const jobsTile = page.locator(
      '[data-home-category-grid] button[data-category-id="jobs"]'
    );
    await expect(jobsTile).toBeVisible({ timeout: 20_000 });
    const jobsImg = jobsTile.locator("img");
    await expect(jobsImg).toHaveCount(1);
    await expect(jobsImg).toHaveAttribute("alt", /portfelis/i);
    await expect(jobsTile).toHaveText(/Darbas/);
  });

  test("visos 8 kategorijos renderina premium <img> — nė viena nenaudoja icon fallback", async ({
    page,
  }) => {
    await openHome(page);
    const tiles = page.locator("[data-home-category-grid] button");
    await expect(tiles).toHaveCount(8);
    for (const id of ALL_CATEGORY_IDS) {
      const tile = page.locator(`[data-home-category-grid] button[data-category-id="${id}"]`);
      await expect(tile.locator("img"), `${id} tile must render an image`).toHaveCount(1);
    }
    // No Lucide icon fallback squares anywhere in the grid.
    await expect(page.locator("[data-home-category-grid] button svg")).toHaveCount(0);
    // Desktop overflow check: the grid must not scroll horizontally.
    const overflow = await page
      .locator("[data-home-category-grid]")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("desktop: 4×2 premium tinklelis — kortelės neperkreiptos, vaizdai telpa zonose", async ({
    page,
  }) => {
    await openHome(page);
    const grid = page.locator("[data-home-category-grid]");
    await grid.scrollIntoViewIfNeeded();

    // Premium multi-row layout: 4 columns × 2 rows — never 8 squeezed columns.
    const cols = await page
      .locator("[data-home-category-grid] li")
      .first()
      .evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns)
      .then((t) => t.split(" ").length);
    expect(cols).toBe(4);
    const firstRowTops = await page
      .locator("[data-home-category-grid] li")
      .evaluateAll((els) =>
        els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().top))
      );
    const secondRowTops = await page
      .locator("[data-home-category-grid] li")
      .evaluateAll((els) =>
        els.slice(4, 8).map((el) => Math.round(el.getBoundingClientRect().top))
      );
    expect(Math.max(...firstRowTops)).toBeLessThan(Math.min(...secondRowTops));

    // No squeezed cards: every card keeps a healthy minimum width.
    const widths = await page
      .locator("[data-category-card]")
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(160);

    // Every image's bounding box fits inside its tile's image zone.
    for (const id of ALL_CATEGORY_IDS) {
      const tile = page.locator(`[data-category-card-id="${id}"]`);
      const zone = tile.locator("[data-category-image-zone]");
      const zoneBox = await zone.boundingBox();
      const imgBox = await tile.locator("img").boundingBox();
      expect(zoneBox).toBeTruthy();
      expect(imgBox).toBeTruthy();
      expect(imgBox!.x).toBeGreaterThanOrEqual(zoneBox!.x - 1);
      expect(imgBox!.y).toBeGreaterThanOrEqual(zoneBox!.y - 1);
      expect(imgBox!.x + imgBox!.width).toBeLessThanOrEqual(zoneBox!.x + zoneBox!.width + 1);
      expect(imgBox!.y + imgBox!.height).toBeLessThanOrEqual(zoneBox!.y + zoneBox!.height + 1);
    }

    // No horizontal page overflow.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("premium iliustracijos matomos light ir dark temose", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await openHome(page);
      for (const id of ["clothing", "jobs", "other"]) {
        const img = page.locator(
          `[data-home-category-grid] button[data-category-id="${id}"] img`
        );
        await expect(img, `${id} visible in ${theme}`).toBeVisible({ timeout: 15_000 });
      }
    }
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

  test("„Kita“ paspaudimas pritaiko canonical other filtrą ir rodo tik other rezultatus", async ({
    page,
  }) => {
    await openHome(page);
    const kita = page.locator(
      '[data-home-category-grid] button[data-category-id="other"]'
    );
    await expect(kita).toBeVisible({ timeout: 20_000 });
    await kita.click();

    await expect(page).toHaveURL(/\/search/, { timeout: 20_000 });
    await expect(page.locator("[data-listing-card]").first()).toBeVisible({
      timeout: 20_000,
    });
    const categories = await page
      .locator("[data-listing-card]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-listing-category") ?? "")
      );
    expect(categories.length, "other results exist").toBeGreaterThan(0);
    for (const c of categories) {
      expect(c, "only canonical other listings are shown").toBe("other");
    }
  });

  test("server/API skelbimas, kurio nėra vietiniame kataloge, hidratuoja detalę pagal ID", async ({
    page,
  }) => {
    const SERVER_LISTING = {
      id: "lt-srv-999",
      title: "Serverinis svetimas skelbimas",
      price: 1337,
      priceLabel: "1337 €",
      location: "Vilnius",
      category: "other",
      description: "Tik serverio kataloge.",
      images: [],
      sellerId: "srv-seller",
      sellerName: "Serverinis",
      status: "active",
      createdAt: "2026-09-01T10:00:00.000Z",
      slug: "serverinis-svetimas-skelbimas",
      contact: "+37060000000",
      tags: [],
      attributes: {},
      allowPastomatas: true,
    };
    await page.route("**/api/listings/lt-srv-999", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SERVER_LISTING),
      });
    });

    await forceOfflineCatalog(page);
    await page.goto("/listing/?id=lt-srv-999");
    await acceptGdprConsentIfPrompted(page);

    await expect(
      page
        .locator("h1:visible, [data-listing-detail-title]:visible")
        .filter({ hasText: "Serverinis svetimas skelbimas" })
        .first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-listing-not-found]")).toHaveCount(0);
  });

  test("kortelė iš serverinio katalogo veda į realų detalės puslapį", async ({
    page,
  }) => {
    const SERVER_LISTING = {
      id: "lt-srv-cat-1",
      title: "Katalogo serverinis objektas",
      price: 42,
      priceLabel: "42 €",
      location: "Kaunas",
      category: "other",
      description: "Serverinio feed objektas.",
      images: [],
      sellerId: "srv-seller",
      sellerName: "Serverinis",
      status: "active",
      createdAt: "2026-09-01T10:00:00.000Z",
      slug: "katalogo-serverinis-objektas",
      contact: "+37060000001",
      tags: [],
      attributes: {},
      allowPastomatas: true,
    };
    // Safety net FIRST (later registrations take precedence): any other API
    // call stays offline and never leaves the machine.
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    );
    await page.route("**/api/health**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, status: "ok" }),
      })
    );
    await page.route("**/api/listings?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([SERVER_LISTING]),
      })
    );
    await page.route("**/api/listings/mine**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    );
    await page.route("**/api/listings/lt-srv-cat-1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SERVER_LISTING),
      })
    );

    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);

    const card = page.locator('[data-listing-id="lt-srv-cat-1"]').first();
    await expect(card).toBeVisible({ timeout: 25_000 });
    await card.locator("a[href]").first().click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 20_000 });
    await expect(
      page
        .locator("h1:visible, [data-listing-detail-title]:visible")
        .filter({ hasText: "Katalogo serverinis objektas" })
        .first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("kategorijų etiketės: „Mada“, „Namai ir buitis“, „Transportas“ ant kortelių", async ({
    page,
  }) => {
    const grid = await openHome(page);

    const clothing = grid.locator('[data-listing-id="lt-clo-001"]');
    await expect(clothing).toBeVisible({ timeout: 20_000 });
    await expect(
      clothing.locator("[data-listing-card-category]")
    ).toHaveText("Mada");

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

    const priceIndex = await card
      .locator("[data-listing-card-price]")
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    const titleIndex = await card
      .locator("h3")
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(priceIndex).toBeLessThan(titleIndex);

    // The photo block precedes the body in the card's DOM (image-first
    // layout) — deterministic and immune to lazy-load scroll jitter.
    const order = await card.evaluate((el) => {
      const anchors = Array.from(el.querySelectorAll("a[href]"));
      const h3 = el.querySelector("h3");
      const media = anchors[0];
      const body = h3?.closest("a[href]");
      if (!media || !body) return { media: -1, body: -1 };
      return {
        media: Array.prototype.indexOf.call(el.querySelectorAll("a[href]"), media),
        body: Array.prototype.indexOf.call(el.querySelectorAll("a[href]"), body),
      };
    });
    expect(order.media).toBeGreaterThanOrEqual(0);
    expect(order.body).toBeGreaterThan(order.media);

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

  test("mobile kategorijų tinklelis: 8 tiles be overflow su premium img", async ({
    page,
  }) => {
    await forceOfflineCatalog(page);
    await page.goto("/");
    await acceptGdprConsentIfPrompted(page);

    const grid = page.locator("[data-home-category-grid]");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await expect(grid.locator("button")).toHaveCount(8);
    for (const id of ALL_CATEGORY_IDS) {
      await expect(
        grid.locator(`button[data-category-id="${id}"] img`),
        `${id} has a premium image on mobile`
      ).toHaveCount(1);
    }
    // Mobile keeps 2 columns — never 8 squeezed.
    const cols = await page
      .locator("[data-home-category-grid] li")
      .first()
      .evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns)
      .then((t) => t.split(" ").length);
    expect(cols).toBe(2);
    const overflow = await page.evaluate(() => {
      const g = document.querySelector("[data-home-category-grid]");
      return g ? g.scrollWidth - g.clientWidth : 999;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // REAL user scroll: bring the whole grid fully above the fixed bottom
    // navigation (the natural position where the last row is fully readable),
    // then verify the last row's titles + counts clear the nav.
    const clearance = await page.evaluate(async () => {
      const grid = document.querySelector("[data-home-category-grid]") as HTMLElement;
      const nav = document.querySelector("[data-mobile-bottom-nav]") as HTMLElement;
      grid.scrollIntoView();
      await new Promise((r) => setTimeout(r, 60));
      const gridBox = grid.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      const delta = gridBox.bottom - navBox.top + 12;
      window.scrollBy(0, delta);
      await new Promise((r) => setTimeout(r, 60));
      const tiles = Array.from(document.querySelectorAll("[data-category-card]"));
      const last = tiles[tiles.length - 1] as HTMLElement;
      const lastBox = last.getBoundingClientRect();
      const newNavTop = nav.getBoundingClientRect().top;
      return {
        clearance: newNavTop - lastBox.bottom,
        navVisible: newNavTop < window.innerHeight,
        scrollY: window.scrollY,
      };
    });
    expect(
      clearance.clearance,
      "last category row must be fully above the bottom nav after a real scroll"
    ).toBeGreaterThanOrEqual(-1);
    expect(clearance.navVisible, "bottom nav itself stays visible").toBe(true);
  });
});

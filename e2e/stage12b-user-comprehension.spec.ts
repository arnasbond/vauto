import { test, expect } from "@playwright/test";
import { listingResults } from "./helpers/listing-results";
import {
  CERTIFIED_VERTICALS,
  VEHICLE_ATTR_RE,
  categoryButtons,
  dismissGdpr,
  expectInFirstViewport,
  falseGuaranteeHit,
  emptySearchHint,
  EMPTY_SEARCH_HINT_RE,
  homeSearchbox,
  horizontalOverflowPx,
  navAddListingCta,
  openHome,
  submitBlankSearch,
  tabUntilFocused,
  visibleBodyText,
} from "./helpers/stage12b-comprehension";

test.describe("Stage 12B — First-Time User Comprehension Readiness", () => {
  test("Test 1 — Kas yra VAUTO (visible UI, not metadata)", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 });

    const h1 = page.locator("[data-home-h1]");
    const subtitle = page.locator("[data-home-subtitle]");
    const search = homeSearchbox(page);
    // MASTER Wave 2 / V5 correction: the hero's buyer/seller button row was
    // removed (natural-language search is now the dominant hero CTA). Selling
    // remains discoverable via the persistent canonical navigation "Įdėti".
    const sellNavCta = navAddListingCta(page);

    // FC-UX V5 — the certified first-5-seconds hierarchy: identity/promise,
    // concise support line, dominant search, sell nav — all first-viewport.
    await expect(h1).toContainText(/VAUTO/);
    await expect(h1).toContainText(/Pasakyk arba parodyk/);
    await expect(subtitle).toContainText(/Ieškok, pirk arba parduok/);

    await expect(search).toBeVisible();
    await expect(sellNavCta).toBeVisible();

    await expectInFirstViewport(h1, page);
    await expectInFirstViewport(subtitle, page);
    await expectInFirstViewport(search, page);
    await expectInFirstViewport(sellNavCta, page);

    const title = await page.title();
    expect(title).toMatch(/VAUTO/i);
    await expect(h1).not.toHaveText(title);
  });

  for (const vp of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 375, height: 812 },
  ] as const) {
    test(`Test 2 — Universal marketplace verticals (${vp.name})`, async ({
      page,
    }) => {
      await openHome(page, { width: vp.width, height: vp.height });
      const grid = page.locator("[data-home-category-grid]");
      // FC-UX V5 — categories are secondary navigation, progressively
      // disclosed via a collapsible "Naršyti pagal kategoriją" disclosure.
      // Open it before asserting the 8 categories remain reachable.
      await grid.scrollIntoViewIfNeeded();
      await grid.locator("summary").click();
      await expect(grid).toBeVisible();

      // F7 — the home grid exposes EXACTLY the 8 user-visible categories
      // (6 canonical verticals + Mada + Kita) from the shared registry.
      const ALL_VISIBLE_CATEGORIES = [...CERTIFIED_VERTICALS, "Mada", "Kita"];
      const buttons = page.locator("[data-home-category-grid] button");
      await expect(buttons).toHaveCount(ALL_VISIBLE_CATEGORIES.length);

      const labels = (await buttons.allTextContents()).map((t) => t.trim());
      for (const vertical of ALL_VISIBLE_CATEGORIES) {
        expect(labels, `${vertical} must be discoverable`).toContain(vertical);
      }

      const boxes = await Promise.all(
        (await buttons.elementHandles()).map((h) => h.boundingBox())
      );
      const heights = boxes.map((b) => b?.height ?? 0);
      const widths = boxes.map((b) => b?.width ?? 0);
      const minH = Math.min(...heights);
      const maxH = Math.max(...heights);
      const minW = Math.min(...widths);
      const maxW = Math.max(...widths);
      expect(maxH - minH, "equal visual height").toBeLessThan(24);
      expect(maxW - minW, "equal visual width").toBeLessThan(48);

      const transportIdx = labels.indexOf("Transportas");
      expect(transportIdx).toBeGreaterThanOrEqual(0);
    });
  }

  test("Test 3 — Natural-language search interaction flow", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 }, { searchStub: "hits" });

    const examples = page.locator("[data-search-examples] button");
    // FC-UX V5 — the certified hero carries 2 concise examples (not 4).
    await expect(examples).toHaveCount(2);
    const chips = (await examples.allTextContents()).map((t) => t.trim());
    expect(chips.some((c) => /butas|NT|120 000/i.test(c))).toBeTruthy();
    expect(chips.some((c) => /nuoma|ekskavator/i.test(c))).toBeTruthy();

    const search = homeSearchbox(page);
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute(
      "placeholder",
      /butas|objekt|parduodate|120 000/i
    );

    // The natural-language search surface is the dominant hero CTA itself
    // (MASTER Wave 2 correction) — clicking it directly is the buyer flow.
    await search.click();
    await expect(search).toBeFocused();

    const query = "MacBook Pro M3 Max naudotas, puikios būklės";
    await search.fill(query);
    await search.press("Enter");

    const results = listingResults(page);
    await expect(results).toBeVisible({ timeout: 15_000 });
    await expect(results).toBeInViewport();
    await expect(results.locator("article").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(results).toContainText(/MacBook/i);
  });

  test("Test 4 — Sell flow is universal (Elektronika, no vehicle fields)", async ({
    page,
  }) => {
    // Reached via the canonical add-listing route directly — the hero no
    // longer carries a dedicated seller button (MASTER Wave 2 correction);
    // selling is discoverable via the persistent nav "Įdėti" control (Test 1)
    // and always reachable at /add/.
    await page.goto("/add/");
    await dismissGdpr(page);

    const funnel = page.locator("[data-seller-funnel]");
    await expect(funnel).toBeVisible({ timeout: 15_000 });
    await expect(funnel).toContainText(/Nufotografuokite prekę|aprašykite/i);
    await expect(funnel).not.toContainText(VEHICLE_ATTR_RE);

    const steps = page.locator("[data-seller-steps]");
    await expect(steps).toBeVisible();
    await expect(steps.locator("li")).toHaveCount(4);
    await expect(steps).toContainText(/Kategorija ar aprašymas/);
    await expect(steps).not.toContainText(VEHICLE_ATTR_RE);

    // FC-UX V5 — categories are progressively disclosed behind a collapsible
    // "Naršyti pagal kategoriją" disclosure; open it before selecting one.
    await page.locator("[data-home-category-grid] summary").click();
    const electronics = page.locator(
      '[data-home-category-grid] button[data-vertical-id="electronics"]'
    );
    await expect(electronics).toHaveText(/Elektronika/);
    await electronics.click();

    await expect(page.locator("[data-selected-vertical]")).toContainText(
      /Elektronika/
    );
    await expect(page.locator("[data-selected-vertical]")).toContainText(
      /MacBook/i
    );
    await expect(funnel).not.toContainText(VEHICLE_ATTR_RE);
    await expect(page.getByText(/Prisijunkite|Prisijungti/i).first()).toBeVisible();
  });

  test("Test 5 — AI role boundary is discoverable", async ({ page }) => {
    // FC-UX V5 — the "AI padeda. Žmogus sprendžia." boundary moved out of the
    // homepage hero into the /add funnel (subtitle + steps) and the DUK page.
    await page.goto("/add/");
    await dismissGdpr(page);
    await expect(page.locator("[data-seller-funnel]")).toBeVisible({ timeout: 15_000 });
    const addText = await visibleBodyText(page);
    expect(addText).toMatch(/VAUTO padės|paruošti skelbimą/i);
    expect(addText).toMatch(/Žmogus sprendžia/i);
    expect(addText).toMatch(/nesiunčia skelbimo|nepriima kainos/i);
    expect(addText).toMatch(/rekomendacija/i);
    expect(addText).not.toMatch(/AI garantuoja|AI priima sprendimą/i);

    await page.goto("/duk/");
    await dismissGdpr(page);
    const duk = await visibleBodyText(page);
    expect(duk).toMatch(/AI padeda\. Žmogus sprendžia/i);
    expect(duk).toMatch(/nepriima finansinių sprendimų|nesudaro sandorio už jus/i);
    expect(duk).toMatch(/nepakeičia profesionalios fizinės apžiūros/i);
    expect(duk).toMatch(/kainos rėžis/i);
  });

  test("Test 6 — Score / AI signal is not a guarantee", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    // FC-UX V5 — the dedicated "VAUTO Score" explainer section was removed; the
    // "analytical signal, not a guarantee" invariant now lives on the listing
    // card's AI price-signal badge title.
    const signal = page.locator("[data-ai-price-signal]").first();
    if (await signal.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await expect(signal).toHaveAttribute(
        "title",
        /ne garantija|ne pirkimo rekomendacija/i
      );
    }
  });

  test("Test 7 — Deal flow mental model without false safety", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 });
    // FC-UX V5 — the homepage "Kaip tai veikia" section was removed; the deal
    // flow is now exposed through the listing detail "Pradėti sandorio eigą"
    // CTA and must never promise a "safe/guaranteed" deal.
    const article = listingResults(page).locator("article").first();
    if (await article.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await article.getByRole("link").first().click();
      await expect(page.locator("body")).not.toContainText(/Skelbimas nerastas/i, {
        timeout: 15_000,
      });
      const dealCta = page.locator("[data-start-deal-cta]");
      if (await dealCta.isVisible().catch(() => false)) {
        const accessible =
          (await dealCta.getAttribute("aria-label")) ||
          (await dealCta.getAttribute("title")) ||
          (await dealCta.innerText());
        expect(accessible).toMatch(/sandorio eig/i);
        expect(accessible).not.toMatch(/saugų sandor/i);
      }
    }
  });

  test("Test 8 — No false platform guarantees in first-time pages", async ({
    page,
  }) => {
    const paths = ["/", "/add/", "/duk/", "/apie/"];
    for (const path of paths) {
      await page.goto(path);
      await dismissGdpr(page);
      const text = await visibleBodyText(page);
      const hit = falseGuaranteeHit(text);
      expect(hit, `false guarantee on ${path}: ${hit ?? ""}`).toBeNull();
    }
  });

  test("Test 9 — Platform fee terminology matches 12A", async ({ page }) => {
    const paths = ["/", "/add/", "/duk/", "/apie/", "/profile/"];
    for (const path of paths) {
      await page.goto(path);
      await dismissGdpr(page);
      const text = await visibleBodyText(page);
      expect(text, path).not.toMatch(/pirkėjo apsaugos mokestis/i);
      expect(text, path).not.toMatch(/AI saugumo garantija/i);
      expect(text, path).not.toMatch(/Gauk nemokamą pirkėjo apsaugą/i);
    }
    await page.goto("/");
    await dismissGdpr(page);
    const article = listingResults(page).locator("article").first();
    if (await article.isVisible().catch(() => false)) {
      await article.getByRole("link").first().click();
      const text = await visibleBodyText(page);
      expect(text).not.toMatch(/pirkėjo apsaugos mokestis/i);
      expect(text).not.toMatch(/AI saugumo garantija/i);
    }
  });

  test("Test 10 — First-time empty / auth failure comprehension", async ({
    page,
  }) => {
    await openHome(page, { width: 1280, height: 800 }, { searchStub: "empty" });
    const search = homeSearchbox(page);
    await search.fill("zzzzqwerty999neegzistuoja");
    await search.press("Enter");
    await expect(
      page.getByText(/neradome|Laukiu šio daikto/i).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /Laukiu šio daikto/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Įjunkite|pabandykite|pranešime/i).first()).toBeVisible();
    const empty = await page
      .getByText(/neradome|Laukiu šio daikto/i)
      .first()
      .locator("xpath=ancestor::div[1]")
      .innerText();
    expect(empty).not.toMatch(VEHICLE_ATTR_RE);
    expect(empty).not.toMatch(/webhook|postgres|stripe|payload/i);

    await page.goto("/add/");
    await dismissGdpr(page);
    await expect(page.getByText(/Prisijunkite|Prisijungti/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.locator("[data-seller-start-auth]").click();
    await expect(
      page.getByText(/Prisijungti|telefon|kodas/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  for (const vp of [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 375, height: 812 },
  ] as const) {
    test(`Test 10C — Blank / whitespace search (${vp.name})`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await openHome(page, { width: vp.width, height: vp.height }, {
        searchStub: "hits",
      });
      const search = homeSearchbox(page);
      const accessibleBefore =
        (await search.getAttribute("aria-label")) ||
        (await search.getAttribute("placeholder")) ||
        "";
      expect(accessibleBefore).not.toMatch(/Ieškoti automobilio/i);

      for (const blank of ["", "   "] as const) {
        const { urlBefore, apiPosts } = await submitBlankSearch(page, blank);
        expect(page.url(), `${JSON.stringify(blank)} must not navigate`).toBe(
          urlBefore
        );
        expect(apiPosts, `${JSON.stringify(blank)} must not call search API`).toEqual(
          []
        );
        const hint = emptySearchHint(page);
        await expect(hint).toBeVisible();
        await expect(hint).toHaveText(EMPTY_SEARCH_HINT_RE);
        const hintText = await hint.innerText();
        expect(hintText).not.toMatch(VEHICLE_ATTR_RE);
        expect(hintText).not.toMatch(
          /automobil|pirkėjo apsaug|saugus sandor|VAUTO garantuoja|100\s*%/i
        );
        await expect(search).toBeFocused();
        await expect(search).toHaveAttribute("aria-invalid", "true");
        const accessibleAfter =
          (await search.getAttribute("aria-label")) ||
          (await search.getAttribute("placeholder")) ||
          "";
        expect(accessibleAfter).toBe(accessibleBefore);
        if (vp.width === 375) {
          expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(1);
          await expect(hint).toBeInViewport();
          await expect(
            page.getByRole("button", { name: "Ieškoti", exact: true })
          ).toBeVisible();
        }
      }

      await search.fill("MacBook");
      await expect(emptySearchHint(page)).toHaveCount(0);
      await expect(search).not.toHaveAttribute("aria-invalid", "true");

      await search.fill("");
      await search.press("Enter");
      await expect(emptySearchHint(page)).toBeVisible();
      // FC-UX V5 — examples are progressively disclosed behind a collapsible
      // "Paieškos pavyzdžiai" summary; open it before selecting a chip.
      await page.locator("details:has([data-search-examples]) summary").click();
      await page.locator("[data-search-examples] button").first().click();
      await expect(emptySearchHint(page)).toHaveCount(0);

      await search.fill("MacBook Pro M3 Max");
      await search.press("Enter");
      const results = listingResults(page);
      await expect(results.locator("article").first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(results).toContainText(/MacBook/i);
    });
  }

  test("Test 10C — Keyboard blank search validation", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("body").click({ position: { x: 8, y: 8 } });
    await tabUntilFocused(page, (el) =>
      /skelbimų paieška|kambarių butas|parduodate|120 000/i.test(el.name)
    );
    const search = homeSearchbox(page);
    await expect(search).toBeFocused();
    const urlBefore = page.url();
    await page.keyboard.press("Enter");
    await expect(emptySearchHint(page)).toBeVisible();
    await expect(emptySearchHint(page)).toHaveText(EMPTY_SEARCH_HINT_RE);
    await expect(search).toBeFocused();
    expect(page.url()).toBe(urlBefore);
    await page.keyboard.type("butas Vilnius");
    await expect(emptySearchHint(page)).toHaveCount(0);
    await expect(search).toHaveValue(/butas Vilnius/);
  });

  test("Test 11 — Mobile 375px first-time flow", async ({ page }) => {
    await openHome(page, { width: 375, height: 812 });
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(1);

    // Buyer capability is the dominant natural-language search surface
    // itself; selling is discoverable via the persistent mobile bottom-nav
    // "Įdėti" control (MASTER Wave 2 correction — no hero button row).
    const search = homeSearchbox(page);
    const sellNavCta = navAddListingCta(page);
    await expect(search).toBeVisible();
    await expect(sellNavCta).toBeVisible();
    await search.scrollIntoViewIfNeeded();
    await expect(search).toBeInViewport();
    await expect(sellNavCta).toBeInViewport();

    const grid = page.locator("[data-home-category-grid]");
    await grid.scrollIntoViewIfNeeded();
    // FC-UX V5 — categories are progressively disclosed; open the collapsible
    // "Naršyti pagal kategoriją" before asserting they remain reachable.
    await grid.locator("summary").click();
    await expect(categoryButtons(page)).toHaveCount(8);
    for (const label of [...CERTIFIED_VERTICALS, "Mada", "Kita"]) {
      await expect(page.locator("[data-home-category-grid]").getByText(label)).toBeVisible();
    }

    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(1);

    // Canonical add-listing route — always reachable regardless of hero layout.
    await page.goto("/add/");
    await dismissGdpr(page);
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(1);
    await expect(page.locator("[data-seller-funnel]")).toBeVisible();
    await expect(page.locator("[data-seller-funnel]")).not.toContainText(
      VEHICLE_ATTR_RE
    );
  });

  test("Test 12 — Keyboard first-time journey", async ({ page }) => {
    await openHome(page, { width: 1280, height: 800 });
    await page.locator("body").click({ position: { x: 8, y: 8 } });

    const searchLandmark = page.getByRole("search", {
      name: /Skelbimų paieška/i,
    });
    await expect(searchLandmark).toBeVisible();

    const searchInfo = await tabUntilFocused(
      page,
      (el) =>
        /skelbimų paieška|kambarių butas|parduodate|120 000/i.test(el.name)
    );
    expect(searchInfo.tag).toMatch(/input|textarea/);
    expect(searchInfo.name).not.toMatch(/Ieškoti automobilio/i);
    await expect(homeSearchbox(page)).toBeFocused();
    await page.keyboard.type("butas Vilnius");
    await expect(homeSearchbox(page)).toHaveValue(/butas Vilnius/);

    const grid = page.locator("[data-home-category-grid]");
    await grid.scrollIntoViewIfNeeded();
    // FC-UX V5 — categories are progressively disclosed; open the disclosure so
    // the first category control is keyboard-reachable.
    await grid.locator("summary").click();
    const firstCat = page.locator("[data-home-category-grid] button").first();
    await firstCat.focus();
    await expect(firstCat).toBeFocused();
    const catName = (await firstCat.innerText()).trim();
    expect(CERTIFIED_VERTICALS as readonly string[]).toContain(catName);
    expect(catName).not.toMatch(/tik automobil/i);
    await page.keyboard.press("Enter");
    await expect(homeSearchbox(page)).toHaveValue(/.+/);

    // Selling is discoverable via the persistent nav "Įdėti" control (MASTER
    // Wave 2 correction — no hero button row). Verify it is keyboard-reachable
    // with a correct, non-vehicle-specific accessible name, then certify the
    // downstream /add/ funnel directly via the canonical route.
    const sellNavCta = navAddListingCta(page);
    await sellNavCta.focus();
    await expect(sellNavCta).toBeFocused();
    const sellName =
      (await sellNavCta.getAttribute("aria-label")) ||
      (await sellNavCta.innerText());
    expect(sellName).not.toMatch(/automobil/i);

    await page.goto("/add/");
    await dismissGdpr(page);
    await expect(page.locator("[data-seller-funnel]")).toBeVisible();
  });
});

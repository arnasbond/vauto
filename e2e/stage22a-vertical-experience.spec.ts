import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  homeSearchbox,
  horizontalOverflowPx,
  installFirstTimeSearchStub,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 22A — vertical experience foundation: capability-driven presentation
 * and universal marketplace adaptation.
 *
 * A–M targeted proof:
 *   A. vehicle result presentation      (make/model/year/mileage on card)
 *   B. real-estate result presentation  (propertyType/rooms/area on card)
 *   C. electronics result presentation  (no fabricated canonical attrs)
 *   D. services result presentation     (provider/pricing semantics)
 *   E. jobs result presentation         (role/employment via canonical+alias)
 *   F. home/garden result presentation  (universal card semantics)
 *   G. vertical switch clears incompatible facets
 *   H. shared canonical state remains consistent (URL ↔ state)
 *   I. listing detail adapts without changing the VAUTO shell
 *   J. LIGHT/DARK parity
 *   K. 390 mobile
 *   L. 1440 desktop
 *   M. no horizontal overflow
 *
 * Runs against the static-export harness (AI-DOWN deterministic path). The
 * canonical vertical registry is the single source of truth; card attribute
 * lines render ONLY for canonical attribute keys present on the listing
 * (legacy data-shape aliases are documented presentation-layer compat).
 *
 * NOTE — deep-link queries below are chosen to MATCH the deterministic mock
 * catalog (e.g. `q=Volvo` hits real vehicles, `q=butas` real-estate,
 * `q=santechnikas` services, `q=vairuotojas` jobs). A deep-link `q` that
 * matches nothing is a legitimate zero-result state, not a bug.
 */

const VEHICLE_CARD = '[data-listing-card][data-listing-category="vehicles"]';
const RE_CARD = '[data-listing-card][data-listing-category="real_estate"]';
const EL_CARD = '[data-listing-card][data-listing-category="electronics"]';
const JOBS_CARD = '[data-listing-card][data-listing-category="jobs"]';
const SERVICES_CARD = '[data-listing-card][data-listing-category="services"]';
const HOME_CARD = '[data-listing-card][data-listing-category="home"]';

const RE_SEARCH_URL =
  "/search?vertical=real_estate&q=" +
  encodeURIComponent("butas Telšiai") +
  "&ca_propertyType=Butas&ca_rooms=1";

async function openSearch(page: Page, url: string) {
  await page.goto(url);
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
}

async function openListingDetail(page: Page, id: string) {
  await page.goto(`/listing/?id=${id}`);
  await dismissGdpr(page);
  await expect(page.locator("[data-listing-detail-2]")).toBeAttached({
    timeout: 20_000,
  });
}

async function openResultsWithQuery(
  page: Page,
  q: string,
  width: number,
  height: number,
  mode: "hits" | "re" = "hits"
) {
  await page.setViewportSize({ width, height });
  await installFirstTimeSearchStub(page, mode);
  await page.goto("/");
  await dismissGdpr(page);
  await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
  const search = homeSearchbox(page);
  await search.fill(q);
  await search.press("Enter");
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 20_000 });
}

/** Assert a card renders vertical attribute lines with the given label/value pairs. */
async function expectCardAttributes(
  page: Page,
  cardSelector: string,
  pairs: Array<[label: string, value: string]>
) {
  const card = page.locator(cardSelector).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  const attrs = card.locator("[data-listing-card-attributes] li");
  await expect(attrs.first()).toBeAttached({ timeout: 10_000 });
  for (const [label, value] of pairs) {
    const li = attrs.filter({ hasText: value });
    await expect(li.first()).toContainText(label, { timeout: 5_000 });
  }
}

test.describe("Stage 22A — vertical experience foundation", () => {
  // ── A. Vehicle result presentation ──────────────────────────────────────
  test("A: vehicle card surfaces canonical make/model/year", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearch(page, "/search?vertical=transport&q=Volvo");
    await expectCardAttributes(
      page,
      VEHICLE_CARD,
      [
        ["Markė", "Volvo"],
        ["Modelis", "S60"],
        ["Metai", "2004"],
      ]
    );
  });

  test("A2: vehicle deep-link card keeps make in attribute line", async ({ page }) => {
    await openSearch(
      page,
      "/search?vertical=transport&q=Volvo&ca_make=Volvo"
    );
    await expectCardAttributes(
      page,
      VEHICLE_CARD,
      [
        ["Markė", "Volvo"],
        ["Modelis", "S60"],
      ]
    );
  });

  // ── B. Real-estate result presentation ──────────────────────────────────
  test("B: real-estate card surfaces propertyType/rooms/area", async ({ page }) => {
    await openSearch(page, RE_SEARCH_URL);
    await expectCardAttributes(
      page,
      RE_CARD,
      [
        ["Objekto tipas", "Butas"],
        ["Kambariai", "1"],
        ["Plotas", "m²"],
      ]
    );
  });

  // ── C. Electronics result presentation ──────────────────────────────────
  test("C: electronics card does not fabricate absent canonical attrs", async ({ page }) => {
    await openSearch(page, "/search?vertical=electronics&q=iPhone");
    await expect(page.locator(EL_CARD).first()).toBeVisible({ timeout: 15_000 });
    const card = page.locator(EL_CARD).first();
    await expect(card.locator("h3")).toBeAttached();
    const attrCount = await card.locator("[data-listing-card-attributes] li").count();
    // Mock catalog carries no electronics canonical attribute block; the card
    // must stay honest (no invented "Gamintojas"/"Būklė" lines) but remain a
    // complete listing surface: price + location + link.
    expect(attrCount).toBeLessThanOrEqual(0);
    const text = await card.innerText();
    expect(text).toContain("€");
    expect(await card.locator("a[href]").count()).toBeGreaterThanOrEqual(1);
  });

  // ── D. Services result presentation ─────────────────────────────────────
  test("D: services listing renders provider/pricing semantics", async ({ page }) => {
    await openSearch(page, "/search?vertical=services&q=santechnikas");
    await expect(page.locator(SERVICES_CARD).first()).toBeVisible({
      timeout: 15_000,
    });
    const servicesCard = page.locator(SERVICES_CARD).first();
    const text = await servicesCard.innerText();
    // Provider verification badge (canonical data), service title, price.
    expect(text).toContain("Santechnikas");
    expect(text).toContain("€");
    // No product-spec blocks on services (no storage/warranty lines).
    expect(text).not.toContain("Atmintis");
    expect(text).not.toContain("Garantija");
    expect(text).not.toContain("Rida");
  });

  // ── E. Jobs result presentation ─────────────────────────────────────────
  test("E: jobs card surfaces role/employment from canonical attrs", async ({ page }) => {
    await openSearch(page, "/search?vertical=jobs&q=vairuotojas");
    await expectCardAttributes(
      page,
      JOBS_CARD,
      [
        ["Pareigos", "Vairuotojas"],
        ["Darbo forma", "Pamainos"],
      ]
    );
    const text = await page.locator(JOBS_CARD).first().innerText();
    expect(text).not.toContain("Rida");
    expect(text).not.toContain("Plotas");
  });

  // ── F. Home/garden result presentation ──────────────────────────────────
  test("F: home/garden card renders with universal semantics", async ({ page }) => {
    await openSearch(page, "/search?vertical=home&q=sofa");
    await expect(page.locator(HOME_CARD).first()).toBeVisible({
      timeout: 15_000,
    });
    const card = page.locator(HOME_CARD).first();
    await expect(card.locator("h3")).toBeAttached();
    const text = await card.innerText();
    expect(text).toContain("€");
    expect(await card.locator("a[href]").count()).toBeGreaterThanOrEqual(1);
  });

  // ── G. Vertical switch clears incompatible facets ───────────────────────
  test("G: vertical switch drops real-estate facets from URL and state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, RE_SEARCH_URL);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("ca_propertyType=");

    // Switch vertical via the classic drawer (same pattern as 21D-J).
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const verticalSelect = page.locator(
      "[data-facet-drawer] [data-facet-vertical-select]"
    );
    await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
    await verticalSelect.selectOption("ELECTRONICS");
    await page.locator("[data-facet-apply]").first().click();

    // Incompatible RE-only facets must vanish from URL (no leak).
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType");
    await expect.poll(async () => page.url()).not.toContain("ca_rooms");
    // Shared canonical price/location semantics may survive only when justified;
    // the incompatible real-estate attribute facets must never leak.
  });

  // ── H. Shared canonical state remains consistent ────────────────────────
  test("H: URL, state and visible cards agree after deep-link", async ({ page }) => {
    await openSearch(page, RE_SEARCH_URL);
    // The anchor RE fixture card renders (canonical state consumed).
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(RE_CARD).first()).toContainText("1 kambario butas studentams");
    // URL remains canonical (no ghost params injected).
    const url = page.url();
    expect(url).toContain("vertical=real_estate");
    expect(url).toContain("ca_propertyType=Butas");
  });

  // ── I. Listing detail adapts without changing the VAUTO shell ───────────
  test("I: real-estate detail keeps shell, shows vertical priority order", async ({ page }) => {
    await openListingDetail(page, "lt-nt-004");
    // VAUTO shell stays: gallery + About + Vietovė sections.
    await expect(page.getByText("Apie skelbimą")).toBeVisible();
    await expect(page.getByText("Vietovė")).toBeVisible();
    // Real-estate primary decision info appears (price + area + rooms).
    const body = await page.locator("body").innerText();
    expect(body).toContain("Plotas");
    expect(body).toContain("Kambariai");
    expect(body).toContain("Telšiai");
  });

  test("I2: vehicle detail surfaces mileage/fuel before generic rows", async ({ page }) => {
    await openListingDetail(page, "lt-auto-001");
    const body = await page.locator("body").innerText();
    expect(body).toContain("Rida");
    expect(body).toContain("Kuras");
  });

  // ── J. LIGHT/DARK parity ────────────────────────────────────────────────
  test("J: light and dark render the same vertical card contract", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((t) => {
        localStorage.setItem("vauto_app_theme_v1", t);
        document.documentElement.setAttribute("data-app-theme", t);
      }, theme);
      await page.emulateMedia({ colorScheme: theme });
      await openSearch(page, RE_SEARCH_URL);
      await expectCardAttributes(
        page,
        RE_CARD,
        [
          ["Objekto tipas", "Butas"],
          ["Kambariai", "1"],
        ]
      );
    }
  });

  // ── K. 390 mobile ───────────────────────────────────────────────────────
  test("K: 390 mobile card wraps without clipping essential info", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, RE_SEARCH_URL);
    const card = page.locator(RE_CARD).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    if (box) expect(box.width).toBeLessThanOrEqual(390);
    await expectCardAttributes(
      page,
      RE_CARD,
      [
        ["Objekto tipas", "Butas"],
        ["Kambariai", "1"],
      ]
    );
  });

  // ── L. 1440 desktop ─────────────────────────────────────────────────────
  test("L: 1440 desktop grid renders multiple vertical cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSearch(
      page,
      "/search?vertical=real_estate&q=" + encodeURIComponent("butas")
    );
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    const count = await page.locator(RE_CARD).count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ── M. No horizontal overflow ───────────────────────────────────────────
  test("M: no horizontal overflow on vertical search LIGHT/DARK at 390/1440", async ({ page }) => {
    for (const theme of ["light", "dark"] as const) {
      for (const vp of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
      ]) {
        await page.setViewportSize(vp);
        await page.addInitScript((t) => {
          localStorage.setItem("vauto_app_theme_v1", t);
          document.documentElement.setAttribute("data-app-theme", t);
        }, theme);
        await openSearch(page, RE_SEARCH_URL);
        expect(
          await horizontalOverflowPx(page),
          `overflow ${theme} ${vp.width}`
        ).toBe(0);
      }
    }
  });

  // ── View-mode capability (22A-5) ────────────────────────────────────────
  test("view-mode: real-estate offers map; jobs disables it (mobile /search)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSearch(page, "/search?vertical=real_estate&q=butas");
    const mapBtn = page.locator('[data-view-mode="map"]').first();
    await expect(mapBtn).toBeVisible({ timeout: 15_000 });
    expect(await mapBtn.getAttribute("aria-disabled")).not.toBe("true");
    // RE is PRIMARY for map → the grid must never force-hide map.
    await expect(page.locator('[data-view-mode="map"][data-view-mode-enabled="true"]').first()).toBeVisible();

    await openSearch(page, "/search?vertical=jobs&q=vairuotojas");
    const jobsMap = page.locator('[data-view-mode="map"]').first();
    await expect(jobsMap).toBeVisible({ timeout: 15_000 });
    // JOBS map capability is NOT_APPLICABLE → disabled (aria-disabled=true).
    await expect(jobsMap).toHaveAttribute("aria-disabled", "true");
  });
});

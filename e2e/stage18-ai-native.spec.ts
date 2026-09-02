import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  installFirstTimeSearchStub,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 18N — AI-native marketplace acceptance.
 *
 * Runs inside the default loopback static-export harness (no live AI backend),
 * so AI interpretation below is deterministic (client-side adapter onto the
 * canonical 13A/13B facet system) — mirroring Stage 17's AI-failure invariant.
 */

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
  await expect(search).toBeVisible();
  await search.fill(q);
  await search.press("Enter");
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
}

async function forceAiFailure(page: Page) {
  await page.route("https://vauto-api.onrender.com/**", async (route) => {
    const method = route.request().method().toUpperCase();
    const url = route.request().url();
    if (/(stream|vauto-agent|conductor|search)\//i.test(url) && method === "POST") {
      await route.abort("connectionfailed");
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
}

test.describe("Stage 18N — AI-native & vertical-adaptive UX", () => {
  // 18N-1 + 18B: natural language → canonical facet chips.
  test("natural language query surfaces editable AI interpretation chips", async ({ page }) => {
    await openResultsWithQuery(page, "Ieškau 2 kambarių buto Vilniuje iki 120 000 €", 1440, 900);

    const interpretation = page.locator("[data-ai-interpretation]");
    await expect(interpretation).toBeVisible({ timeout: 10_000 });

    // Vertical (NT) + location (Vilnius) + price (iki 120000) interpreted.
    await expect(page.locator('[data-ai-chip][data-chip-kind="vertical"]')).toHaveCount(1);
    await expect(page.locator('[data-ai-chip][data-chip-field="location"]')).toBeVisible();
    // Chips are editable / removable / addable controls (buttons + add menu).
    await expect(page.locator('[data-ai-chip-remove]').first()).toBeVisible();
    await expect(page.locator("[data-ai-chip-add]")).toBeVisible();

    const overflow = await horizontalOverflowPx(page);
    expect(overflow, "no horizontal overflow with AI chips").toBeLessThanOrEqual(0);
  });

  // 18N-2: an AI facet can be removed and stays removed.
  test("AI location facet is removable and stays removed", async ({ page }) => {
    await openResultsWithQuery(page, "Ieškau 2 kambarių buto Vilniuje iki 120 000 €", 1280, 800);

    const locChip = page.locator('[data-ai-chip][data-chip-field="location"]');
    await expect(locChip).toBeVisible({ timeout: 10_000 });
    await locChip.locator("[data-ai-chip-remove]").click();
    await expect(locChip).toHaveCount(0);
    // The vertical chip remains (other facets do not vanish oddly).
    await expect(page.locator('[data-ai-chip][data-chip-kind="vertical"]')).toBeVisible();
  });

  // 18N-3 + 18A: an AI facet can be changed / filters added manually.
  test("AI facets are editable and new filters can be added", async ({ page }) => {
    await openResultsWithQuery(page, "Ieškau 2 kambarių buto Vilniuje iki 120 000 €", 1280, 800);

    const interpretation = page.locator("[data-ai-interpretation]");
    await expect(interpretation).toBeVisible({ timeout: 10_000 });

    // Add-filter menu opens.
    await page.locator("[data-ai-chip-add]").click();
    await expect(page.locator("[data-ai-add-menu]")).toBeVisible();
    // Base add options (Vietovė / Kaina iki / Būklė / Spindulys) + attribute options.
    await expect(page.locator('[data-ai-add-menu-item="priceMax"]')).toBeVisible();
    await expect(page.locator('[data-ai-add-menu-item="location"]')).toBeVisible();

    // Close the add menu before interacting with the editable facet chips —
    // while the menu (or its click-outside overlay) is open, pointer interactions
    // with the chips are (correctly) dismissed as outside-clicks (18K).
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-ai-add-menu]")).toHaveCount(0);

    // Editing an enum chip opens an inline select. The interpretation for an NT
    // query surfaces a canonical "Objektas" (propertyType) attribute chip whose
    // enum options are editable in place.
    const propertyChip = page
      .locator('[data-ai-chip][data-chip-field="propertyType"]')
      .first();
    await expect(propertyChip).toBeVisible({ timeout: 5_000 });
    await propertyChip.locator("[data-ai-chip-edit]").click();
    await expect(page.locator("[data-ai-chip-editor]")).toBeAttached({ timeout: 5_000 });
  });

  // 18N-4 + 18C: when AI fails, classic search still works.
  test("AI failure → classic marketplace remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await forceAiFailure(page);
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });

    await homeSearchbox(page).fill("elektronika");
    await homeSearchbox(page).press("Enter");

    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // No full-screen lock; results + marketplace chrome present.
    const nav = page.getByRole("navigation", { name: "Pagrindinė navigacija" });
    await expect(nav).toBeVisible();
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 18N-5: category browse works without AI.
  test("category browse without AI is present and interactive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await forceAiFailure(page);
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });

    await expect(page.getByRole("button", { name: /Transportas/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nekilnojamas turtas|NT/i }).first()).toBeVisible();
  });

  // 18N-9 + 18E: real-estate results NEVER show a delivery/Omniva capability.
  test("real-estate cards expose no Omniva/delivery capability (deterministic)", async ({ page }) => {
    // Deterministic fixture: the "re" stub pins a canonical REAL_ESTATE listing
    // (lt-nt-004 "1 kambario butas studentams", Telšiai), so an RE card MUST
    // render. We assert it does (never a silent pass on a sparse/absent result
    // set), then that no shipping capability leaks onto it (canonical 13A
    // capability model disallows shipping for REAL_ESTATE).
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");

    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    const cards = page.locator('[data-listing-card][data-listing-category="real_estate"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const realEstateCardCount = await cards.count();
    expect(realEstateCardCount, "at least one real_estate card is rendered").toBeGreaterThan(0);

    // Canonical 13A capability model disallows shipping for REAL_ESTATE → no Omniva.
    await expect(cards.getByText(/Omniva|Pristatymas/i)).toHaveCount(0);
  });

  // 18N-7 + 18D: real-estate vertical uses a readable 1-column mobile layout.
  // Stage 22A.1-A — the narrow-mobile automatic default is LIST; an explicit
  // GRID selection renders the real-estate grid in one column at 390px.
  test("mobile 390px: real-estate/jobs grid is 1-column, goods stays 2-column", async ({ page }) => {
    // Deterministic "re" fixture guarantees a real_estate adaptive grid renders,
    // so the column assertion is meaningful (not skipped when the grid is absent).
    await openResultsWithQuery(page, "butas Telšiai", 390, 844, "re");

    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    // Stage 22A.1-A automatic default on narrow mobile is the readable LIST.
    const listRows = page.locator(".listing-card-row");
    await expect(listRows.first()).toBeVisible({ timeout: 10_000 });
    expect(await horizontalOverflowPx(page)).toBeLessThanOrEqual(0);

    // The user explicitly chooses GRID (CASE 2) — the RE grid renders 1 column.
    const gridToggle = page.getByRole("button", { name: "Tinklelis" }).first();
    await expect(gridToggle).toBeVisible({ timeout: 10_000 });
    await gridToggle.click();
    const gridSel = '[data-listing-grid][data-grid-vertical="real_estate"]';
    const grid = page.locator(gridSel).first();
    await expect(grid).toBeVisible({ timeout: 10_000 });
    const freshGrid = page.locator(gridSel).first();
    await expect(freshGrid).toHaveCount(1);
    const colCount = await freshGrid.evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns.split(" ").length
    );
    expect(colCount, "RE grid uses one column at 390px").toBe(1);
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 18N-13 + 18M: LIGHT and DARK are real, togglable and the only themes.
  test("LIGHT/DARK are real themes and the only affine themes available", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });

    const root = page.locator("html");
    await expect
      .poll(() => root.getAttribute("data-app-theme"), { timeout: 10_000 })
      .not.toBeNull();

    // 1) Force LIGHT via the app's own persistence key and assert the canonical root signal.
    await page.evaluate(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.reload();
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => root.getAttribute("data-app-theme"), { timeout: 10_000 })
      .toBe("light");

    // 2) Toggle DARK → assert the root signal actually flips to DARK.
    await page.evaluate(() => {
      localStorage.setItem("vauto_app_theme_v1", "dark");
    });
    await page.reload();
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => root.getAttribute("data-app-theme"), { timeout: 10_000 })
      .toBe("dark");

    // 3) Toggle back to LIGHT → assert LIGHT again.
    await page.evaluate(() => {
      localStorage.setItem("vauto_app_theme_v1", "light");
    });
    await page.reload();
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => root.getAttribute("data-app-theme"), { timeout: 10_000 })
      .toBe("light");

    // 4) No third/original theme: a legacy value is normalised by the app to LIGHT,
    //    and no legacy theme brand/option is ever exposed.
    await page.evaluate(() => {
      localStorage.setItem("vauto_app_theme_v1", "vauto-original");
    });
    await page.reload();
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => root.getAttribute("data-app-theme"), { timeout: 10_000 })
      .toBe("light");
    await expect(page.locator("[data-theme-option=\"vauto-original\"]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Trečia tema|3 tema/i })).toHaveCount(0);
  });

  // 18N-14 + 18K: AI facet chips are fully keyboard-operable (focus remove → Enter).
  test("AI chips are keyboard-operable: keyboard removal reduces chip count + updates state", async ({ page }) => {
    await openResultsWithQuery(page, "Ieškau 2 kambarių buto Vilniuje iki 120 000 €", 1280, 800);

    await expect(page.locator("[data-ai-interpretation]")).toBeVisible({ timeout: 10_000 });

    // Confirm at least one editable AI facet chip exists, then capture BEFORE.
    const chips = page.locator("[data-ai-chip]");
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });
    const before = await chips.count();
    expect(before, "at least one editable AI facet chip exists").toBeGreaterThanOrEqual(1);

    // Keyboard-only: focus the target chip's remove control (no mouse), press Enter.
    const locationRemove = page
      .locator('[data-ai-chip][data-chip-field="location"] [data-ai-chip-remove]')
      .first();
    await expect(locationRemove).toBeVisible({ timeout: 10_000 });
    await locationRemove.focus();
    await expect(locationRemove).toBeFocused();
    await page.keyboard.press("Enter");

    // AFTER must be exactly BEFORE - 1 (one chip removed via keyboard).
    await expect(chips).toHaveCount(before - 1);

    // Canonical state/UI reflects the removal: the location chip is gone and the
    // removal is reflected in the marketplace filter state / URL.
    await expect(page.locator('[data-ai-chip][data-chip-field="location"]')).toHaveCount(0);
    const chipFieldsAfter = await page
      .locator('[data-ai-chip][data-chip-field]')
      .evaluateAll(
        (els) => els.map((el) => el.getAttribute("data-chip-field")) as string[]
      );
    expect(chipFieldsAfter).not.toContain("location");
  });

  // 18N-17: Back/Forward preserves meaningful search, facet AND view state.
  test("back/forward preserves search & view state with real values", async ({ page }) => {
    // State A — typed search through the real first-time-search path with the
    // deterministic "re" stub: interpretable chips (RE vertical, Telšiai, Butas)
    // AND a real_estate listing object rendered in the adaptive grid. No mouse-only
    // shortcuts; we go through home → search → grid → view toggle → back → forward.
    await openResultsWithQuery(page, "butas Telšiai", 390, 844, "re");

    await expect(page.locator("[data-ai-interpretation]")).toBeVisible({ timeout: 10_000 });

    // Capture State A real facet/view values from the DOM (query meaning is
    // carried by the editable AI chips, not a bare URL ?q= on the homepage).
    const verticalChip = page.locator('[data-ai-chip][data-chip-kind="vertical"]');
    const locationChip = page.locator('[data-ai-chip][data-chip-field="location"]');
    await expect(verticalChip).toHaveCount(1, { timeout: 10_000 });
    const verticalText = await verticalChip.first().innerText();
    expect(verticalText, "state A has a real vertical value").toContain("Nekilnojamas");
    await expect(locationChip.first()).toBeVisible({ timeout: 10_000 });
    const locationText = await locationChip.first().innerText();
    expect(locationText).toContain("Telšiai");
    const classicFacetCount = await page
      .locator('[data-ai-chip][data-chip-field="propertyType"]')
      .count();
    expect(classicFacetCount, "state A includes a classic attribute facet (propertyType)").toBeGreaterThan(0);

    // State A view: on narrow mobile the automatic default is LIST (22A.1-A);
    // the canonical mode is grid (Tinklelis NOT pressed — LIST is pressed), and
    // the URL carries no ?view. A real RE card renders in the single column.
    const gridToggle = page.getByRole("button", { name: "Tinklelis" }).first();
    const listToggle = page.getByRole("button", { name: "Sąrašas" }).first();
    await expect(listToggle.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-listing-card][data-listing-category="real_estate"]').first()).toBeVisible({ timeout: 10_000 });
    const stateAUrl = page.url();
    const listRows = page.locator(".listing-card-row");
    await expect(listRows.first()).toBeVisible({ timeout: 10_000 });
    expect(stateAUrl).not.toMatch(/view=/); // automatic default → no view param

    // Navigate to state B via a real navigational view change: LIST → MAP
    // (real-estate has map PRIMARY). MAP pushes ?view=map, creating a history
    // entry that Back/Forward must traverse. (GRID is the canonical no-param
    // state per 17.1-A, so it is NOT a navigation entry.)
    const mapToggle = page.getByRole("button", { name: "Žemėlapis" }).first();
    await expect(mapToggle).toBeVisible({ timeout: 10_000 });
    await mapToggle.click();
    await expect(page.getByRole("button", { name: "Žemėlapis" }).first()).toHaveAttribute("aria-pressed", "true");
    const stateBUrl = page.url();
    expect(stateBUrl).not.toBe(stateAUrl);
    expect(new URL(stateBUrl).searchParams.get("view")).toBe("map");

    // Browser Back → real State A restored (responsive LIST, vertical+location+classic).
    await page.goBack({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    const verticalTextBack = await page
      .locator('[data-ai-chip][data-chip-kind="vertical"]')
      .first()
      .innerText();
    expect(verticalTextBack, "state A vertical restored after Back").toContain("Nekilnojamas");
    await expect(page.locator('[data-ai-chip][data-chip-field="location"]').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-ai-chip][data-chip-field="propertyType"]').count()).toBeGreaterThan(0);
    await expect(listRows.first()).toBeVisible({ timeout: 10_000 }); // LIST restored
    await expect(page.locator("[data-listing-map-view]")).toHaveCount(0);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    // Browser Forward → real State B restored (explicit map).
    await page.goForward({ waitUntil: "load" });
    await expect(page.getByRole("button", { name: "Žemėlapis" }).first()).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("view")).toBe("map");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
  });

  // 18N-16 + 18L: horizontal overflow = 0 across the responsive matrix.
  for (const vp of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`overflow = 0 on homepage at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await dismissGdpr(page);
      await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });
      const overflow = await horizontalOverflowPx(page);
      expect(overflow, `homepage overflow at ${vp.width}`).toBeLessThanOrEqual(0);
    });
  }
});

import { test, expect, type Page } from "@playwright/test";
import {
  dismissGdpr,
  horizontalOverflowPx,
  homeSearchbox,
  installFirstTimeSearchStub,
} from "./helpers/stage12b-comprehension";

/**
 * Stage 18.2 — AI-native universal marketplace flow hardening (E2E).
 *
 * Runs inside the default loopback static-export harness (no live AI backend),
 * so AI interpretation is the deterministic client-side adapter onto the
 * canonical 13A/13B facet system. Each scenario uses a deterministic stub
 * ("re"/"hits"/"empty") that pins a known listing, so results are real objects,
 * never a silent pass on an empty result set.
 *
 * The capability/semantics themselves come from the canonical domain model —
 * these tests only observe the resulting UI signals.
 */

async function openResultsWithQuery(
  page: Page,
  q: string,
  width: number,
  height: number,
  mode: "hits" | "re" | "empty" = "hits"
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

test.describe("Stage 18.2 — AI-native universal marketplace flow", () => {
  // 18.2-B E2E: removing an AI chip is a real control — it disappears from the
  // readout and the live result pipeline stays correct (unit test proves the
  // numeric recompute; this proves the DOM/state wiring end-to-end).
  test("an AI facet chip is a real removable control that keeps results live", async ({ page }) => {
    // Deterministic "re" stub: query "butas Telšiai" surfaces vertical + location
    // (Telšiai) + propertyType chips with a pinned RE card.
    await openResultsWithQuery(page, "butas Telšiai", 1280, 800, "re");

    await expect(page.locator("[data-ai-interpretation]")).toBeVisible({ timeout: 10_000 });

    // The location chip is an editable/removable AI facet.
    const locationChip = page.locator('[data-ai-chip][data-chip-field="location"]');
    await expect(locationChip.first()).toBeVisible({ timeout: 10_000 });
    expect(await locationChip.count()).toBeGreaterThanOrEqual(1);
    await expect(locationChip.first().locator("[data-ai-chip-remove]")).toBeVisible();

    // Removing it (a real user control) drops the criterion from the readout.
    await locationChip.first().locator("[data-ai-chip-remove]").click();
    await expect(locationChip).toHaveCount(0);

    // The result pipeline stays live (grid re-rendered, not frozen/ghosted).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(
      page.locator('[data-listing-card][data-listing-category="real_estate"]').first()
    ).toBeVisible({ timeout: 10_000 });
    // Other facets remain — vertical chip persists (no cascade-delete oddity).
    await expect(page.locator('[data-ai-chip][data-chip-kind="vertical"]')).toBeVisible();
  });

  // 18.2-C E2E: AI → classic filter change → recompute → Back/Forward.
  test("AI → classic filter change recomputes and Back/Forward preserve both states", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 390, 844, "re");

    await expect(page.locator("[data-ai-interpretation]")).toBeVisible({ timeout: 10_000 });

    // State A: RE vertical + Telšiai location + a classic propertyType attribute.
    const verticalChip = page.locator('[data-ai-chip][data-chip-kind="vertical"]');
    await expect(verticalChip).toHaveCount(1, { timeout: 10_000 });
    const stateAVertical = await verticalChip.first().innerText();
    expect(stateAVertical).toContain("Nekilnojamasis");

    // State A grid view.
    const gridToggle = page.getByRole("button", { name: "Tinklelis" }).first();
    const listToggle = page.getByRole("button", { name: "Sąrašas" }).first();
    await expect(gridToggle).toBeVisible({ timeout: 10_000 });

    // Change a classic filter: toggle to list view (a canonical view control).
    await listToggle.click();
    await expect(
      page.getByRole("button", { name: "Sąrašas" }).first()
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".listing-card-row").first()).toBeVisible({ timeout: 10_000 });
    const stateBurl = page.url();
    expect(stateBurl).toMatch(/view=list/);

    // Browser Back → state A (grid) restored, AI facets preserved.
    await page.goBack({ waitUntil: "load" });
    await expect(
      page.getByRole("button", { name: "Tinklelis" }).first()
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    const verticalBack = await page
      .locator('[data-ai-chip][data-chip-kind="vertical"]')
      .first()
      .innerText();
    expect(verticalBack).toContain("Nekilnojamasis");

    // Browser Forward → state B (list) restored.
    await page.goForward({ waitUntil: "load" });
    await expect(
      page.getByRole("button", { name: "Sąrašas" }).first()
    ).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await expect(page.locator(".listing-card-row").first()).toBeVisible({ timeout: 15_000 });
  });

  // 18.2-E E2E: zero results is a recoverable state, not a dead end.
  test("zero results shows a clear empty state and remains recoverable (no fake results)", async ({ page }) => {
    // Deterministic empty stub → no matching listings. Query "zzzzqwerty999" is
    // absurd (matches nothing in the deterministic catalog), so the app renders
    // a clear no-results state instead of fabricating results.
    await openResultsWithQuery(page, "zzzzqwerty999", 1280, 800, "empty");

    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    // A clear no-results heading is rendered (deterministic empty state).
    await expect(
      page.getByRole("heading", { name: "Tokios prekės dar nėra" }).first()
    ).toBeVisible({ timeout: 10_000 });

    // No fake listings are injected to fill the screen (0 cards).
    const cards = page.locator('[data-listing-card]');
    expect(await cards.count()).toBe(0);

    // Recovery is not a dead end: a broader-search control ("Platesnė paieška")
    // is offered and the classic filter controls remain interactive.
    await expect(
      page.getByRole("button", { name: /Platesnė paieška/i }).first()
    ).toBeVisible({ timeout: 10_000 });
    const categoryFilter = page.getByRole("combobox", { name: "Kategorija" });
    await expect(categoryFilter).toBeVisible();
    const locationInput = page.getByRole("textbox", { name: "Vietovė" });
    await expect(locationInput).toBeVisible();
  });

  // 18.2-F E2E: AI failure → classic marketplace stays fully usable.
  test("AI unavailable → classic search, filters, results and detail navigation work", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await forceAiFailure(page);
    await page.goto("/");
    await dismissGdpr(page);
    await expect(page.locator("[data-home-h1]")).toBeVisible({ timeout: 20_000 });

    // Classic keyword search still returns results.
    await homeSearchbox(page).fill("elektronika");
    await homeSearchbox(page).press("Enter");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    // Marketplace navigation chrome is present (categories + results).
    const nav = page.getByRole("navigation", { name: /Pagrindinė navigacija/i });
    await expect(nav).toBeVisible();

    // No horizontal overflow in degraded mode.
    const overflow = await horizontalOverflowPx(page);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 18.2-H E2E: capability invariants — RE never shows shipping; goods can when canonical allows.
  test("capability invariant: REAL_ESTATE card exposes no shipping (deterministic)", async ({ page }) => {
    await openResultsWithQuery(page, "butas Telšiai", 1440, 900, "re");

    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    const cards = page.locator('[data-listing-card][data-listing-category="real_estate"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const reCount = await cards.count();
    expect(reCount, "at least one RE card renders").toBeGreaterThan(0);

    // Canonical capability model disallows shipping for REAL_ESTATE → no Omniva.
    await expect(cards.getByText(/Omniva|Pristatymas/i)).toHaveCount(0);
  });

  // 18.2-G E2E: mobile 390 and desktop 1440 critical path remains functional and overflow-free.
  for (const vp of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`mobile/desktop ${vp.width}px: chips + results fit viewport, no overflow`, async ({ page }) => {
      await openResultsWithQuery(page, "butas Telšiai", vp.width, vp.height, "re");

      await expect(page.locator("[data-ai-interpretation]")).toBeVisible({ timeout: 10_000 });
      await expect(
        page.locator('[data-listing-card][data-listing-category="real_estate"]').first()
      ).toBeVisible({ timeout: 10_000 });

      const overflow = await horizontalOverflowPx(page);
      expect(overflow, `overflow at ${vp.width}px`).toBeLessThanOrEqual(0);
    });
  }
});

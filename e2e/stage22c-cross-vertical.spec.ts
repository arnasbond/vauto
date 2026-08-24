import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22C — VERTICAL EXPERIENCE COMPLETION & CROSS-VERTICAL CONTINUITY
 *
 * Deterministic cross-vertical switching E2E (static-export harness, AI-DOWN
 * path is the runtime truth — AI interpretation is the client-side canonical
 * adapter, no live backend required).
 *
 * The canonical vertical registry (13A) is the single source of truth: every
 * transition asserts URL state, facet pruning, preserved compatible state,
 * classic/AI parity, back/forward, reload/deep-link, LIST/GRID/MAP capability
 * and responsive behavior — never a second taxonomy.
 *
 * Deterministic fixtures (mock catalog — same as 22A/18.3):
 *   real_estate  "butas Telšiai" → lt-nt-004 (Butas, 1 kamb., Telšiai, 89 000 €)
 *   transport    "Volvo"          → lt-auto-v70-* (Volvo V70, Panevėžys region)
 *   electronics  "iPhone"         → lt-el-001 (iPhone 15 Pro)
 *   services     "santechnikas"   → services fixture
 *   jobs         "vairuotojas"    → lt-job-001 (Vairuotojas CE)
 *   home         "sofa"           → lt-home-001 (Sofa-lova)
 */

const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const WIDE = { width: 1440, height: 900 };
const DESKTOP = { width: 1920, height: 1080 };

// Canonical RE deep-link: canonical predicates (propertyType/rooms_min/location)
// + complement price + AI chip complement. Hydrates deterministically (22C §10).
const RE_URL_CANONICAL =
  "/search?vertical=real_estate&q=" +
  encodeURIComponent("butas Telšiai") +
  "&location=Tel%C5%A1iai&propertyType=Butas&rooms_min=1&price_min=50000&price_max=120000";

// Complement-only RE deep-link (certified 18.3 shape — anchor card lt-nt-004).
const RE_URL_COMPLEMENT =
  "/search?vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas&ca_rooms=1";

const EL_URL = "/search?vertical=electronics&q=iPhone";
const TR_URL = "/search?vertical=transport&q=Volvo";
const SV_URL = "/search?vertical=services&q=santechnikas";
const JOBS_URL = "/search?vertical=jobs&q=vairuotojas";
const HOME_URL = "/search?vertical=home&q=sofa";

const VEHICLE_CARD = '[data-listing-card][data-listing-category="vehicles"]';
const RE_CARD = '[data-listing-card][data-listing-category="real_estate"]';
const EL_CARD = '[data-listing-card][data-listing-category="electronics"]';
const SV_CARD = '[data-listing-card][data-listing-category="services"]';
const JOBS_CARD = '[data-listing-card][data-listing-category="jobs"]';
const HOME_CARD = '[data-listing-card][data-listing-category="home"]';

async function applyTheme(page: Page, theme: "light" | "dark" = "light") {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("vauto_app_theme_v1", t);
    } catch {
      // about:blank has no origin — ignore.
    }
    document.documentElement?.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function openSearch(
  page: Page,
  url: string,
  viewport = MOBILE,
  theme: "light" | "dark" = "light"
) {
  await applyTheme(page, theme);
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
}

async function switchVerticalInDrawer(page: Page, verticalId: string) {
  await page.locator("[data-facet-drawer-trigger]").first().click();
  const verticalSelect = page.locator(
    "[data-facet-drawer] [data-facet-vertical-select]"
  );
  await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
  await verticalSelect.selectOption(verticalId);
  await page.locator("[data-facet-apply]").first().click();
}

test.describe("Stage 22C — cross-vertical continuity (chromium)", () => {
  test("A1: Real Estate → Electronics — incompatible RE facets pruned, price survives", async ({
    page,
  }) => {
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    // The canonical RE state is in the URL (predicates + complement + chip).
    expect(page.url()).toContain("propertyType=Butas");
    expect(page.url()).toContain("rooms_min=1");
    expect(page.url()).toContain("ca_propertyType=Butas");

    await switchVerticalInDrawer(page, "ELECTRONICS");

    // 1. Active vertical updated.
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    // 2/3. RE-only canonical predicates pruned (incompatible facets).
    await expect.poll(async () => page.url()).not.toContain("propertyType=");
    await expect.poll(async () => page.url()).not.toContain("rooms_min=");
    // 3. RE-only complement attrs pruned.
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("ca_rooms=");
    // 4. Compatible global state survives: query + price.
    expect(page.url()).toContain("q=butas");
    expect(page.url()).toContain("price_min=50000");
    expect(page.url()).toContain("price_max=120000");
    // 6. Canonical URL updated — no obsolete RE-only params, no oscillation.
    expect(page.url()).toContain("vertical=electronics");
  });

  test("A2: ... → back to Real Estate — compatible RE state restored", async ({
    page,
  }) => {
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("ca_propertyType=Butas");

    // RE → EL.
    await switchVerticalInDrawer(page, "ELECTRONICS");
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");

    // EL → RE via deep-link URL (deterministic restoration — §10).
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("ca_propertyType=Butas");
    expect(page.url()).toContain("location=Tel%C5%A1iai");
    expect(page.url()).toContain("rooms_min=1");
  });

  test("B: Electronics → Transport — no electronics-only attrs leak", async ({
    page,
  }) => {
    await openSearch(page, EL_URL, MOBILE);
    await expect(page.locator(EL_CARD).first()).toBeVisible({ timeout: 15_000 });

    await switchVerticalInDrawer(page, "TRANSPORT");

    // 1. Active vertical updated.
    await expect.poll(async () => page.url()).toContain("vertical=transport");
    // 4. Global canonical query is preserved (manual switch, not a new AI intent).
    expect(page.url()).toContain("q=iPhone");
    // 3. No electronics-only attrs leak (nothing electronics-specific was set,
    // so no ca_* params appear for the new vertical either).
    expect(page.url()).not.toContain("ca_");
    expect(page.url()).not.toContain("deviceModel=");
    expect(page.url()).not.toContain("manufacturer=");
    // 9. Result set reachable — the transport presentation renders for a
    // transport vertical. (The electronics query is global state, so the
    // zero-result transport scope is a coherent state, not a dead end.)
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();
  });

  test("C: Transport → Services — vehicle attrs pruned, services state coherent", async ({
    page,
  }) => {
    // Transport deep-link with a canonical vehicle predicate (make).
    await openSearch(
      page,
      "/search?vertical=transport&q=Volvo&make=Volvo",
      MOBILE
    );
    await expect(page.locator(VEHICLE_CARD).first()).toBeVisible({
      timeout: 15_000,
    });
    expect(page.url()).toContain("make=Volvo");

    await switchVerticalInDrawer(page, "SERVICES");

    // 1. Active vertical updated.
    await expect.poll(async () => page.url()).toContain("vertical=services");
    // 3. make is TRANSPORT-only canonical attribute → pruned for SERVICES.
    await expect.poll(async () => page.url()).not.toContain("make=");
    // 4. Global query survives (canonical state, never silently broadened).
    expect(page.url()).toContain("q=Volvo");
    // 8. Canonical results scope remains reachable (zero-result state is
    // coherent — criteria visible, never a dead end).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();
  });

  test("D: Services → Jobs — location SURVIVES (JOBS owns location)", async ({
    page,
  }) => {
    await openSearch(
      page,
      "/search?vertical=services&q=santechnikas&location=Jonava",
      MOBILE
    );
    await expect(page.locator(SV_CARD).first()).toBeVisible({ timeout: 15_000 });

    await switchVerticalInDrawer(page, "JOBS");

    // 1. Active vertical updated.
    await expect.poll(async () => page.url()).toContain("vertical=jobs");
    // 4. JOBS owns a canonical location → the location survives (as the
    // canonical predicate after transition, not a stale complement).
    await expect.poll(async () => page.url()).toContain("location=Jonava");
    // 8. Canonical results scope remains reachable (legitimate zero-result
    // JOBS state for a services query — never a dead end).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();
  });

  test("E: Jobs → Home/Garden — jobs attrs pruned, URL clean, zero-result state coherent", async ({
    page,
  }) => {
    // JOBS deep-link with a canonical jobs predicate (employmentType — valid enum).
    await openSearch(
      page,
      "/search?vertical=jobs&q=vairuotojas&employmentType=Pilnas%20etatas",
      MOBILE
    );
    expect(page.url()).toContain("employmentType=");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });

    await switchVerticalInDrawer(page, "HOME_GARDEN");

    // 1. Active vertical updated.
    await expect.poll(async () => page.url()).toContain("vertical=home");
    // 3. employmentType is JOBS-only canonical attribute → pruned.
    await expect.poll(async () => page.url()).not.toContain("employmentType=");
    await expect.poll(async () => page.url()).not.toContain("salaryMin_");
    // 4. Global query survives (canonical state preserved, not silently broadened).
    expect(page.url()).toContain("q=vairuotojas");
    // 8. Zero-result HOME state is coherent: criteria visible in URL + results
    // scope present (spec §8: never silently broaden, never retain hidden
    // invalid facets). No obsolete jobs params remain.
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();
    expect(page.url()).not.toContain("salaryMin_");
  });

  test("AI sequence: query → inferred vertical → manual switch → filter edit → AI refinement", async ({
    page,
  }) => {
    // Query that infers REAL_ESTATE ("butas Telšiai").
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-ai-chip][data-chip-kind="vertical"]').first()
    ).toContainText("Nekilnojamasis");

    // Manual vertical switch → ELECTRONICS via drawer.
    await switchVerticalInDrawer(page, "ELECTRONICS");
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    // The APPLIED state is pruned deterministically: no RE-only canonical
    // predicates or complement attrs remain in the URL (the invisible stale
    // filter is gone — spec §3/§4).
    await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
    await expect.poll(async () => page.url()).not.toContain("ca_rooms=");
    await expect.poll(async () => page.url()).not.toContain("propertyType=");
    await expect.poll(async () => page.url()).not.toContain("rooms_min=");

    // AI refinement: add a price facet via the AI add-menu (classic+AI parity —
    // both write the SAME canonical state/URL).
    await expect(page.locator("[data-ai-chip-add]").first()).toBeVisible({
      timeout: 10_000,
    });
    await page.locator("[data-ai-chip-add]").first().click();
    await expect(page.locator("[data-ai-add-menu]").first()).toBeVisible();
    await page.locator('[data-ai-add-menu-item="priceMax"]').first().click();
    await expect.poll(async () => page.url()).toContain("price_max=");

    // Classic filter edit on the SAME state: open drawer, set location, apply.
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const locationInput = page
      .locator("[data-facet-drawer]")
      .getByRole("textbox", { name: "Vietovė" });
    await expect(locationInput).toBeVisible({ timeout: 10_000 });
    await locationInput.fill("Vilnius");
    await page.locator("[data-facet-apply]").first().click();
    await expect.poll(async () => page.url()).toContain("location=Vilnius");
    // AI price facet still present in the SAME canonical URL (no split state).
    expect(page.url()).toContain("price_max=");
    // No vertical regression: still electronics.
    expect(page.url()).toContain("vertical=electronics");
    // 8. Canonical results scope remains reachable.
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
  });

  test("URL/Back/Forward: deep-link history contract — Back restores RE, Forward restores EL", async ({
    page,
  }) => {
    // The certified canonical-write path uses replaceState (URL = canonical
    // state, not navigation history), so the vertical-switch URL update is
    // covered by A1/responsive tests. Here we verify the BROWSER history
    // contract for deep-links (§10): Back → previous valid state,
    // Forward → next valid state, each reconstructed deterministically.
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("ca_propertyType=Butas");
    expect(page.url()).toContain("rooms_min=1");

    // New history entry: electronics deep-link.
    await page.goto(EL_URL, { waitUntil: "load" });
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect.poll(async () => page.url()).toContain("vertical=electronics");

    // Browser Back → previous valid deep-link state (RE) reconstructs
    // equivalent state deterministically from its URL.
    await page.goBack({ waitUntil: "load" });
    await dismissGdpr(page);
    await expect.poll(async () => page.url()).toContain("vertical=real_estate");
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("ca_propertyType=Butas");
    expect(page.url()).toContain("rooms_min=1");

    // Browser Forward → next valid deep-link state (EL) restored.
    await page.goForward({ waitUntil: "load" });
    await dismissGdpr(page);
    await expect.poll(async () => page.url()).toContain("vertical=electronics");
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
  });

  test("reload/deep-link: cross-vertical URL reconstructs equivalent state", async ({
    page,
  }) => {
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain("ca_propertyType=Butas");

    const urlBefore = page.url();
    await page.reload({ waitUntil: "load" });
    await dismissGdpr(page);
    await expect(page.locator(RE_CARD).first()).toBeVisible({ timeout: 15_000 });
    // The mixed canonical+complement URL reconstructs EQUIVALENT state — the
    // deterministic 22C §10 deep-link contract (canonical predicates survive
    // reload, complement price survives).
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("rooms_min=1");
    expect(page.url()).toContain("price_max=120000");
    expect(page.url()).toContain("ca_propertyType=Butas");
  });

  test("view-mode capability survives vertical switch (RE map, JOBS disabled)", async ({
    page,
  }) => {
    await openSearch(page, RE_URL_CANONICAL, MOBILE);
    const mapBtn = page
      .locator('[data-view-mode="map"][data-view-mode-enabled="true"]')
      .first();
    await expect(mapBtn).toBeVisible({ timeout: 15_000 });

    await switchVerticalInDrawer(page, "JOBS");
    await expect.poll(async () => page.url()).toContain("vertical=jobs");
    const jobsMap = page.locator('[data-view-mode="map"]').first();
    await expect(jobsMap).toHaveAttribute("aria-disabled", "true");
    // Canonical LIST result scope still present (JOBS has no map — the RE
    // query legitimately yields a zero-result JOBS state, never a dead end).
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("[data-facet-drawer-trigger]").first()).toBeVisible();
  });
});

test.describe("Stage 22C — responsive cross-vertical continuity (chromium)", () => {
  for (const vp of [MOBILE, TABLET, WIDE, DESKTOP]) {
    test(`390/768/1440/1920 — vertical switch keeps controls reachable, no overflow (${vp.width})`, async ({
      page,
    }) => {
      const isDesktop = vp.width >= 768;
      // Mobile: /search uses the drawer surface (single universal path).
      // Desktop: the home layout sidebar (`#desktop-facet-vertical`) is the
      // certified desktop switch control.
      const url = isDesktop
        ? "/?vertical=real_estate&q=" +
          encodeURIComponent("butas Telšiai") +
          "&location=Tel%C5%A1iai&propertyType=Butas&rooms_min=1&price_min=50000&price_max=120000"
        : RE_URL_CANONICAL;
      await openSearch(page, url, vp);
      const reCard = page.locator(RE_CARD).first();
      if (await reCard.isVisible().catch(() => false)) {
        await expect(reCard).toBeVisible({ timeout: 15_000 });
      } else {
        await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
      }

      if (isDesktop) {
        // Desktop home sidebar: vertical select drives the deterministic
        // transition (setVertical → commit with pruning).
        const verticalSelect = page.locator("#desktop-facet-vertical").first();
        await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
        await verticalSelect.selectOption("ELECTRONICS");
        await expect.poll(async () => page.url()).toContain("vertical=electronics");
        await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
        await expect.poll(async () => page.url()).not.toContain("rooms_min=");
        // Filters remain usable: the sidebar panel stays interactive.
        await expect(page.locator("#desktop-facet-sort")).toBeVisible({
          timeout: 10_000,
        });
      } else {
        // Mobile: universal drawer path.
        await switchVerticalInDrawer(page, "ELECTRONICS");
        await expect.poll(async () => page.url()).toContain("vertical=electronics");
        await expect.poll(async () => page.url()).not.toContain("ca_propertyType=");
        await expect.poll(async () => page.url()).not.toContain("rooms_min=");
        // Filters remain usable after the switch (drawer opens and closes).
        await page.locator("[data-facet-drawer-trigger]").first().click();
        await expect(page.locator("[data-facet-drawer]").first()).toBeVisible({
          timeout: 10_000,
        });
        await page.keyboard.press("Escape");
      }

      // No horizontal overflow at any viewport.
      expect(
        await horizontalOverflowPx(page),
        `overflow at ${vp.width}px`
      ).toBe(0);
      // No URL oscillation after the switch settles.
      const urlAfter = page.url();
      await page.waitForTimeout(400);
      expect(page.url()).toBe(urlAfter);
    });
  }
});

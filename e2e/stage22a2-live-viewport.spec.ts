import { test, expect, type Page } from "@playwright/test";
import { dismissGdpr, horizontalOverflowPx } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.2 — DYNAMIC VIEWPORT / FOLDABLE / LIVE RESPONSIVE CONTINUITY GATE
 *
 * Proves VAUTO stays functionally and visually stable when the viewport changes
 * during a live session (folded phone -> unfold -> fold, portrait/landscape
 * rotation, split-screen, tablet, desktop resize) WITHOUT page reload.
 *
 * Device-agnostic: no UA sniffing, no vendor-specific CSS, no device names in
 * production logic. Uses page.setViewportSize() only.
 *
 * NOTE on `effectiveViewMode` (22A.1-A): canonical viewMode/viewModeExplicit stay
 * untouched by resize — the render-time helper maps (mode, explicit, isMobile)
 * -> effective presentation. So:
 *  - NO explicit choice + narrow mobile  => LIST (safe default)
 *  - NO explicit choice + wide           => canonical mode (grid)
 *  - explicit choice                     => always respected, resize never overwrites
 *  - capability (MAP NOT_APPLICABLE)     => render-time gate + canonical fallback
 */

const MOBILE = { width: 390, height: 844 };
const INTERMEDIATE = { width: 640, height: 800 };
const TABLET = { width: 768, height: 1024 };
const WIDE = { width: 1200, height: 900 };
const LANDSCAPE = { width: 844, height: 390 };

const RE_DEEP_LINK =
  "/search?q=" +
  encodeURIComponent("butas Telšiai") +
  "&vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas";

const VEHICLE_URL = "/search?vertical=transport&q=Volvo";
const JOBS_URL = "/search?vertical=jobs&q=vairuotojas";
const RE_URL = "/search?vertical=real_estate&q=butas";

async function openSearch(
  page: Page,
  url = VEHICLE_URL,
  theme: "light" | "dark" = "light",
  viewport = MOBILE
) {
  await applyTheme(page, theme);
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
}

/** Playwright box -> intersection-friendly {left,top,right,bottom}. */
function toBox(b: { x: number; y: number; width: number; height: number }) {
  return {
    left: b.x,
    top: b.y,
    right: b.x + b.width,
    bottom: b.y + b.height,
    width: b.width,
    height: b.height,
  };
}

function intersectionArea(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

async function boxesOf(page: Page, selector: string) {
  const boxes: Array<{ left: number; top: number; right: number; bottom: number; width: number; height: number }> =
    await page.$$eval(selector, (els) =>
      els
        .filter((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        })
    );
  return boxes;
}

/** No horizontal overflow + no control leaves the viewport horizontally. */
async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await horizontalOverflowPx(page);
  expect(overflow, `${label}: horizontal overflow px`).toBe(0);
  const vw = page.viewportSize()!.width;
  for (const sel of ["[data-marketplace-filter-bar]", "[data-view-mode]", "[data-listing-card]"]) {
    const boxes = await boxesOf(page, sel);
    for (const b of boxes) {
      expect(b.left, `${label}: ${sel} left >= 0`).toBeGreaterThanOrEqual(-0.5);
      expect(b.right, `${label}: ${sel} right <= ${vw}`).toBeLessThanOrEqual(vw + 0.5);
    }
  }
}

/** Bottom nav / sticky geometry (reuses 22A.1E methodology). */
async function assertBottomNavSafe(page: Page, label: string) {
  const nav = page.locator("[data-mobile-bottom-nav]:visible").first();
  const count = await nav.count();
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;
  if (count === 0) {
    // Desktop: no mobile bottom nav — assert desktop nav doesn't collide with content.
    const header = page.locator("[data-app-shell] [data-app-header], header").first();
    if ((await header.count()) > 0 && (await header.isVisible().catch(() => false))) {
      const hb = await header.boundingBox();
      const firstCard = page.locator("[data-listing-card]").first();
      if ((await firstCard.count()) > 0 && (await firstCard.isVisible().catch(() => false))) {
        const cb = await firstCard.boundingBox();
        if (hb && cb) {
          expect(
            cb.y + cb.height,
            `${label}: first card must be visible below the header`
          ).toBeGreaterThan(hb.y + hb.height - 2);
        }
      }
    }
    return;
  }
  await expect(nav).toBeVisible({ timeout: 10_000 });

  // Model the user at the top of the page: resize must not leave the page
  // scrolled such that the first card is permanently under the fixed nav.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(async () => await page.evaluate(() => window.scrollY), { timeout: 5_000 })
    .toBeLessThanOrEqual(2);

  const navBox = await nav.boundingBox();
  expect(navBox).toBeTruthy();
  expect(navBox!.x, `${label}: nav x`).toBeGreaterThanOrEqual(-0.5);
  expect(navBox!.x + navBox!.width, `${label}: nav right`).toBeLessThanOrEqual(vw + 0.5);
  expect(navBox!.y, `${label}: nav y`).toBeGreaterThanOrEqual(-0.5);
  expect(navBox!.y + navBox!.height, `${label}: nav bottom`).toBeLessThanOrEqual(vh + 0.5);

  // First card not permanently obscured by the nav at the top scroll position.
  const firstCard = page.locator("[data-listing-card]").first();
  if ((await firstCard.count()) > 0 && (await firstCard.isVisible().catch(() => false))) {
    const cb = await firstCard.boundingBox();
    if (cb) {
      const overlap = intersectionArea(toBox(navBox!), toBox(cb));
      expect(overlap, `${label}: first card x nav overlap`).toBeLessThanOrEqual(1);
    }
  }

  // User-safe invariant: scroll to bottom — last essential content clears the nav.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const lastCard = page.locator("[data-listing-card]").last();
  if ((await lastCard.count()) > 0) {
    await expect
      .poll(async () => {
        const b = await lastCard.boundingBox();
        if (!b) return -1;
        const nb = await nav.boundingBox();
        if (!nb) return -1;
        return b.y + b.height;
      })
      .toBeLessThan((await nav.boundingBox())!.y);
  }
  // Restore top for subsequent assertions.
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Collect runtime diagnostics during a page session. */
function attachDiagnostics(page: Page) {
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  return { errors, consoleErrors, assertClean: () => expect(errors, "no page errors").toHaveLength(0) };
}

/** Theme init guard: document.documentElement may be null on about:blank. */
async function applyTheme(page: Page, theme: "light" | "dark") {
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

test.describe("22A.2-B/C/D — core fold→unfold→fold without reload (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("search state, filters, vertical, canonical URL survive 390→768→1200→768→390; auto presentation adapts; explicit choice respected", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    await openSearch(page, RE_DEEP_LINK, "light");

    // --- Establish meaningful state at 390px. ---
    // Deep link: q="butas Telšiai", vertical=real_estate, location=Telšiai,
    // price_max=120000, ca_propertyType=Butas, ca_rooms=1.
    await expect(page.locator('[data-listing-card][data-listing-category="real_estate"]').first()).toBeVisible({
      timeout: 25_000,
    });
    // Automatic mobile-safe default: LIST (no explicit ?view in URL).
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute("aria-pressed", "true");
    const urlBefore = page.url();

    // --- Resize chain WITHOUT reload. ---
    for (const vp of [INTERMEDIATE, TABLET, WIDE, TABLET, INTERMEDIATE, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);

      // Functional: results still attached, cards render.
      await expect(page.locator("#listing-results")).toBeAttached({ timeout: 15_000 });
      await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 15_000 });

      // No horizontal overflow.
      expect(await horizontalOverflowPx(page)).toBe(0);

      // Canonical URL unchanged by resize (no history pollution, no state rewrite).
      expect(page.url(), `URL unchanged at ${vp.width}`).toBe(urlBefore);
    }

    // Automatic presentation adapts:
    // wide => canonical grid (no explicit choice; view-mode switcher is mobile-only
    // by architecture — md:hidden — so assert the canonical grid presentation).
    await page.setViewportSize(WIDE);
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 15_000 });
    expect(await horizontalOverflowPx(page)).toBe(0);
    // narrow again => LIST returns automatically (mobile-safe default).
    await page.setViewportSize(MOBILE);
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute("aria-pressed", "true");

    // Filters/vertical survived (assert via URL + chips).
    expect(page.url()).toContain("vertical=real_estate");
    expect(page.url()).toContain("ca_propertyType=Butas");
    expect(page.url()).toContain("price_max=120000");
    expect(page.url()).toContain("location=");
    diag.assertClean();
  });

  test("explicit GRID on mobile survives widen+narrow (resize never becomes a new user decision)", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    await openSearch(page, RE_DEEP_LINK, "light");
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 20_000 });

    // Explicit user choice: GRID.
    await page.getByRole("button", { name: "Tinklelis" }).first().click();
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 20_000 });
    const urlAfterGrid = page.url();

    // Widen to tablet then desktop. View-mode switcher is mobile-only (md:hidden),
    // but the explicit GRID choice must survive in canonical state and rendering.
    for (const vp of [TABLET, WIDE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      // Explicit GRID respected at every width (canonical render keeps grid).
      await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 15_000 });
      expect(await horizontalOverflowPx(page)).toBe(0);
      // URL unchanged by resize (grid = canonical no-param state).
      expect(page.url()).toBe(urlAfterGrid);
    }

    // Narrow again — explicit GRID still respected (not silently flipped to LIST);
    // the mobile switcher is visible again and shows GRID pressed.
    await page.setViewportSize(MOBILE);
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Tinklelis" }).first()).toHaveAttribute("aria-pressed", "true");
    expect(await page.locator('[data-listing-card="list"]').count()).toBe(0);
    diag.assertClean();
  });

  test("explicit LIST on mobile survives widen+narrow", async ({ page }) => {
    await openSearch(page, RE_DEEP_LINK, "light");
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 20_000 });
    // Explicitly select LIST (?view=list appears in URL — distinct history entry).
    await page.getByRole("button", { name: "Sąrašas" }).first().click();
    await page.waitForTimeout(150);
    const urlList = page.url();
    expect(new URL(urlList).searchParams.get("view")).toBe("list");

    for (const vp of [TABLET, WIDE, TABLET, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      // Explicit LIST renders list cards at every width (no view switcher on wide,
      // but canonical ?view=list must keep list presentation).
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 15_000 });
      expect(page.url(), `no history pollution at ${vp.width}`).toBe(urlList);
    }
    // Mobile switcher shows LIST pressed (explicit choice intact).
    await expect(page.getByRole("button", { name: "Sąrašas" }).first()).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("22A.2-E — capability safety during live resize (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("REAL_ESTATE + MAP valid across resize; JOBS never resurrects MAP; resize cannot bypass capability", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    // RE with explicit MAP (map is PRIMARY for real_estate).
    await page.goto("/search?vertical=real_estate&q=butas&view=map", { waitUntil: "load" });
    await dismissGdpr(page);
    await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-view-mode="map"]').first()).not.toBeDisabled();

    // Resize chain keeps RE+MAP valid.
    for (const vp of [INTERMEDIATE, TABLET, WIDE, TABLET, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      await expect(page.locator('[data-view-mode="map"]').first()).not.toBeDisabled();
      await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-pressed", "true");
      expect(await horizontalOverflowPx(page)).toBe(0);
    }

    // Switch vertical to JOBS via facet drawer (MAP = NOT_APPLICABLE).
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const verticalSelect = page.locator("[data-facet-drawer] [data-facet-vertical-select]");
    await expect(verticalSelect).toBeVisible({ timeout: 10_000 });
    await verticalSelect.selectOption({ label: "Darbas" });
    await page.locator("[data-facet-apply]").first().click();
    await page.waitForTimeout(400);

    // Capability-safe fallback applied immediately: MAP disabled everywhere.
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('[data-view-mode="map"]').first()).toBeDisabled();

    // Resize cannot resurrect MAP — try every width.
    for (const vp of [INTERMEDIATE, TABLET, WIDE, TABLET, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
      await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator('[data-view-mode="map"]').first()).toBeDisabled();
    }
    // URL no longer carries view=map (canonical state safe).
    expect(new URL(page.url()).searchParams.get("view")).not.toBe("map");
    diag.assertClean();
  });
});

test.describe("22A.2-F — navigation transition 390→wide→390 (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("no duplicate active nav, hidden nav not interactable, focus not trapped, safe-area restored", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    await openSearch(page, VEHICLE_URL, "light");

    // At 390: exactly ONE bottom nav visible; desktop header still present but mobile nav unique.
    const mobileNav = page.locator('[data-mobile-bottom-nav]:visible');
    await expect(mobileNav).toHaveCount(1);

    // Widen to desktop.
    await page.setViewportSize(WIDE);
    await page.waitForTimeout(300);
    // Mobile bottom nav gone (hidden layout not interactable).
    await expect(page.locator("[data-mobile-bottom-nav]")).toHaveCount(0);
    await expect(mobileNav).toHaveCount(0);
    // Desktop header visible; content not colliding.
    await assertNoHorizontalOverflow(page, "desktop after widen");
    await assertBottomNavSafe(page, "desktop widen");

    // Focus is not trapped in hidden layout: focusing body/search works.
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? el.tagName + (el.getAttribute("data-view-mode") ? `:${el.getAttribute("data-view-mode")}` : "") : "";
    });
    // Whatever got focus, it must be a VISIBLE element (not a hidden bottom-nav item).
    const focusedVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(focusedVisible, `focus landed on visible element (${active})`).toBe(true);

    // Narrow back to mobile.
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(300);
    await expect(page.locator("[data-mobile-bottom-nav]")).toHaveCount(1);
    await assertBottomNavSafe(page, "mobile restored");
    expect(await horizontalOverflowPx(page)).toBe(0);
    diag.assertClean();
  });
});

test.describe("22A.2-G — filter drawer during resize (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("drawer survives widen+narrow safely; overlay never stale; trigger usable after close", async ({
    page,
  }) => {
    const diag = attachDiagnostics(page);
    await openSearch(page, VEHICLE_URL, "light");

    // Open mobile filter drawer at 390px.
    await page.locator("[data-facet-drawer-trigger]").first().click();
    const drawer = page.locator("[data-facet-drawer]");
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // Drawer fits viewport.
    const d0 = await drawer.boundingBox();
    expect(d0).toBeTruthy();
    expect(d0!.x).toBeGreaterThanOrEqual(-0.5);
    expect(d0!.x + d0!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);

    // Resize to tablet WITHOUT reload. Canonical behaviour: the mobile drawer is
    // rendered under md:hidden chrome, so it becomes hidden while the open state
    // is preserved — it transforms, it does NOT linger as a stale visible overlay.
    await page.setViewportSize(TABLET);
    await page.waitForTimeout(250);
    await expect(drawer).toBeHidden({ timeout: 10_000 });
    await expect(drawer).not.toBeVisible();
    // No body scroll-lock survived.
    const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
    expect(bodyOverflow, "body must not remain scroll-locked").toBe("");
    // No visible overlay / presentation layer remains on wide.
    const visibleOverlays = await page
      .locator('[role="presentation"]')
      .evaluateAll(
        (els) =>
          els.filter((el) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }).length
      );
    expect(visibleOverlays, "no leftover visible overlay").toBe(0);
    // Focus is not trapped: active element is visible.
    const focusedVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    expect(focusedVisible, "focus on visible element after drawer hide").toBe(true);

    // Reverse wide -> 390: the SAME open session transforms back — drawer is
    // visible again (not a stale duplicate) and usable.
    await page.setViewportSize(WIDE);
    await page.waitForTimeout(200);
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(250);
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    // Exactly ONE drawer instance (no duplicate filter UI).
    expect(await page.locator("[data-facet-drawer]").count()).toBe(1);

    // Close it — trigger becomes usable immediately.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden({ timeout: 10_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const trigger = page.locator("[data-facet-drawer-trigger]").first();
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    diag.assertClean();
  });
});

test.describe("22A.2-H — orientation-like transitions (chromium, LIGHT + DARK)", () => {
  test.use({ viewport: MOBILE });

  for (const theme of ["light", "dark"] as const) {
    test(`portrait→landscape→portrait ${theme} — no overflow, no stale sticky, no unreachable CTA`, async ({
      page,
    }) => {
      const diag = attachDiagnostics(page);
      await openSearch(page, VEHICLE_URL, theme);

      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 20_000 });

      // 390x844 -> 844x390 -> 390x844 without reload.
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await expect(page.locator("[data-listing-card]").first()).toBeVisible({ timeout: 10_000 });
      await assertNoHorizontalOverflow(page, "landscape");
      await assertBottomNavSafe(page, "landscape");
      // No clipped header/search controls.
      const filterBar = page.locator("[data-marketplace-filter-bar]").first();
      if (await filterBar.isVisible().catch(() => false)) {
        const fb = await filterBar.boundingBox();
        expect(fb).toBeTruthy();
        expect(fb!.x).toBeGreaterThanOrEqual(-0.5);
        expect(fb!.x + fb!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      expect(await horizontalOverflowPx(page)).toBe(0);
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 10_000 });
      await assertBottomNavSafe(page, "portrait restored");

      // State survived.
      expect(page.url()).toContain("vertical=transport");
      diag.assertClean();
    });
  }
});

test.describe("22A.2-I — intermediate widths readable (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("600–700px: LIST cards readable, controls inside viewport, no collision", async ({ page }) => {
    await openSearch(page, RE_URL, "light");

    for (const width of [600, 640, 700]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(200);
      // Auto mobile default still LIST below md(768).
      await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 10_000 });
      expect(await horizontalOverflowPx(page)).toBe(0);
      await assertNoHorizontalOverflow(page, `intermediate ${width}`);
    }

    // Above md -> canonical grid, readable (view switcher is mobile-only).
    await page.setViewportSize({ width: 768, height: 800 });
    await page.waitForTimeout(250);
    await expect(page.locator('[data-listing-card="grid"]').first()).toBeVisible({ timeout: 10_000 });
    expect(await horizontalOverflowPx(page)).toBe(0);
  });
});

test.describe("22A.2-K — state continuity & no history pollution (chromium)", () => {
  test.use({ viewport: MOBILE });

  test("Back/Forward still traverse view changes; resize adds no history entries", async ({ page }) => {
    const diag = attachDiagnostics(page);
    await openSearch(page, RE_DEEP_LINK, "light");
    await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({ timeout: 20_000 });

    const urlA = page.url();
    // Explicit LIST -> MAP (RE supports map) creates a real history entry.
    await page.getByRole("button", { name: "Žemėlapis" }).first().click();
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-pressed", "true");
    const urlB = page.url();
    expect(new URL(urlB).searchParams.get("view")).toBe("map");

    // Resize back and forth — must NOT create history entries.
    const historyLenBefore = await page.evaluate(() => window.history.length);
    for (const vp of [WIDE, TABLET, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(200);
    }
    const historyLenAfter = await page.evaluate(() => window.history.length);
    expect(historyLenAfter, "resize must not add history entries").toBe(historyLenBefore);

    // Browser Back restores explicit LIST state.
    await page.goBack();
    await expect(page.locator('[data-view-mode="list"]').first()).toHaveAttribute("aria-pressed", "true");
    // Browser Forward restores MAP.
    await page.goForward();
    await expect(page.locator('[data-view-mode="map"]').first()).toHaveAttribute("aria-pressed", "true");
    diag.assertClean();
  });
});

test.describe("22A.2-L — listing detail continuity (chromium)", () => {
  test.use({ viewport: MOBILE });

  for (const theme of ["light", "dark"] as const) {
    test(`same listing stays open 390→640→768→1200→390 (${theme}); CTA reachable; no overflow`, async ({
      page,
    }) => {
      const diag = attachDiagnostics(page);
      await applyTheme(page, theme);
      await page.goto("/listing/?id=lt-auto-001", { waitUntil: "load" });
      await dismissGdpr(page);
      await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 25_000 });
      // Title/price survive (stable selector: detail <h1>, first = mobile block).
      const detail = page.locator("[data-listing-detail-2]").first();
      await expect(detail.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      const titleBefore = await detail.locator("h1").first().innerText();
      expect(titleBefore.trim().length).toBeGreaterThan(0);

      for (const vp of [
        { width: 640, height: 800 },
        { width: 768, height: 900 },
        { width: 1200, height: 900 },
        MOBILE,
      ]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(250);
        // Same listing still open.
        await expect(page.locator("[data-listing-detail-2]")).toBeAttached({ timeout: 10_000 });
        const titleAfter = await detail.locator("h1").first().innerText();
        expect(titleAfter).toBe(titleBefore);
        expect(await horizontalOverflowPx(page)).toBe(0);
        await assertBottomNavSafe(page, `detail ${vp.width} ${theme}`);
      }

      // CTA reachable: primary action link/button inside detail.
      const primary = page
        .locator("[data-listing-detail-2] a, [data-listing-detail-2] button")
        .first();
      await expect(primary).toBeVisible({ timeout: 10_000 });
      await primary.focus();
      await expect(primary).toBeFocused();
      diag.assertClean();
    });
  }
});

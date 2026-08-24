import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { dismissGdpr } from "./helpers/stage12b-comprehension";

/**
 * Stage 22A.1-E — 390px visual evidence (AFTER).
 *
 * Regenerates the narrow-mobile evidence for the three verticals named in the
 * delta (vehicles, jobs, real_estate) in LIGHT and DARK at 390x844, plus an
 * explicit WebKit/iPhone capture. The automatic mobile default must now be the
 * readable single-column LIST (Stage 22A.1-A), never a forced dense 2-column
 * grid.
 *
 * BEFORE evidence lives in docs/audit/stage22a/visual (captured during Stage
 * 22A with the dense-grid automatic default). AFTER evidence is written under
 * docs/audit/stage22a1/visual. Screenshots are visual evidence only — the
 * geometry tests (stage22a1-mobile-geometry.spec.ts) prove bounding-box
 * non-overlap independently.
 */

const OUT = path.join(process.cwd(), "docs", "audit", "stage22a1", "visual");
const VERTICALS = [
  { slug: "vehicles", url: "/search?vertical=transport&q=Volvo" },
  { slug: "jobs", url: "/search?vertical=jobs&q=vairuotojas" },
  { slug: "real_estate", url: "/search?vertical=real_estate&q=butas" },
] as const;

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    localStorage.setItem("vauto_app_theme_v1", t);
    document.documentElement.setAttribute("data-app-theme", t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
}

async function captureSearch(
  page: Page,
  theme: "light" | "dark",
  vertical: string,
  url: string,
  engine: "chromium" | "webkit"
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await setTheme(page, theme);
  await page.goto(url, { waitUntil: "load" });
  await dismissGdpr(page);
  await expect(page.locator("#listing-results")).toBeAttached({ timeout: 25_000 });
  await expect(page.locator("[data-listing-card]").first()).toBeVisible({
    timeout: 25_000,
  });
  // The automatic narrow-mobile default must be the readable LIST, not a
  // dense 2-column grid.
  await expect(page.locator('[data-listing-card="list"]').first()).toBeVisible({
    timeout: 15_000,
  });
  expect(await page.locator('[data-listing-card="grid"]').count()).toBe(0);
  await page.waitForTimeout(500);
  const file = path.join(OUT, `${vertical}-${theme}-390-${engine}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const overflow = await page.evaluate(() => {
    return {
      body: document.body.scrollWidth - document.body.clientWidth,
      root: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(
    Math.max(overflow.body, overflow.root),
    `horizontal overflow ${vertical} ${theme} 390 ${engine}`
  ).toBe(0);
}

test.describe("22A.1-E — 390px AFTER visual evidence (chromium)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const v of VERTICALS) {
      test(`${v.slug} ${theme} 390 chromium`, async ({ page }) => {
        await captureSearch(page, theme, v.slug, v.url, "chromium");
      });
    }
  }
});
